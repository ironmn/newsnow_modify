import process from "node:process"
import type {
  PressGenerationRequest,
  PressGenerationResponse,
  PressReference,
  PressSearchMode,
  PressSectionConfig,
  PressSectionID,
  PressSectionInput,
  PressSectionResult,
} from "@shared/press"
import {
  PRESS_WORDS_PER_MINUTE,
  defaultPressSections,
  pressSectionMap,
} from "@shared/press"
import { $fetch } from "ofetch"
import { myFetch as request } from "#/utils/fetch"

const SERP_API_KEY = process.env.SERPAPI_API_KEY
const READER_API_KEY = process.env.READER_API_KEY
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY
const DEEPSEEK_API_BASE = process.env.DEEPSEEK_API_BASE ?? "https://api.deepseek.com"
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? "deepseek-chat"

interface SectionRuntime {
  config: PressSectionConfig
  prompt: string
  durationMinutes: number
  targetWords: number
}

interface SectionContext extends SectionRuntime {
  sources: SectionSource[]
  usedQueries: string[]
}

interface SectionSource extends PressReference {
  content?: string
  origin?: string
}

type Runnable<I, O> = (input: I) => Promise<O>

function sequence<I, O>(...steps: Runnable<any, any>[]): Runnable<I, O> {
  return async (initial: I) => {
    let acc: any = initial
    for (const step of steps) {
      acc = await step(acc)
    }
    return acc as O
  }
}

function normalizeSections(inputs?: PressSectionInput[]): SectionRuntime[] {
  const inputMap = new Map<PressSectionID, PressSectionInput>()
  inputs?.forEach((item) => {
    if (pressSectionMap[item.id]) inputMap.set(item.id, item)
  })

  return defaultPressSections.map((config) => {
    const input = inputMap.get(config.id)
    const durationMinutes = input?.durationMinutes ?? config.durationMinutes
    const prompt = input?.prompt?.trim?.() || config.defaultPrompt
    const targetWords = config.targetWords
      ?? Math.round(durationMinutes * PRESS_WORDS_PER_MINUTE)
    return {
      config,
      prompt,
      durationMinutes,
      targetWords,
    }
  })
}

function assertEnv(searchMode: PressSearchMode) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error("DeepSeek API key 未配置：请在环境变量中设置 DEEPSEEK_API_KEY")
  }
  if (searchMode === "web") {
    if (!SERP_API_KEY) throw new Error("SerpAPI key 未配置：请在环境变量中设置 SERPAPI_API_KEY")
    if (!READER_API_KEY) throw new Error("Reader key 未配置：请在环境变量中设置 READER_API_KEY")
  }
}

async function fetchSerp(query: string) {
  const url = new URL("https://serpapi.com/search")
  url.searchParams.set("engine", "google")
  url.searchParams.set("q", query)
  url.searchParams.set("api_key", SERP_API_KEY!)
  url.searchParams.set("gl", "cn")
  url.searchParams.set("hl", "zh-cn")
  url.searchParams.set("num", "5")
  url.searchParams.set("tbs", "qdr:d")

  const res: any = await request(url.toString())
  const raw = res?.organic_results ?? []
  return raw
    .map((item: any) => ({
      title: item.title as string,
      url: (item.link || item.url) as string,
      snippet: (item.snippet || item.snippet_highlighted_words?.join(" ") || "") as string,
      origin: item.source || item.displayed_link || "",
    }))
    .filter((item: any) => item?.title && item?.url)
}

async function fetchReader(url: string) {
  try {
    const res: any = await request("https://open.bigmodel.cn/api/paas/v4/reader", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${READER_API_KEY}`,
      },
      timeout: 20000,
      body: {
        url,
        timeout: 20,
        no_cache: false,
        return_format: "markdown",
        retain_images: true,
        no_gfm: false,
        keep_img_data_url: false,
        with_images_summary: false,
        with_links_summary: false,
      },
    })
    if (!res) return undefined
    if (typeof res === "string") return res
    return res?.data ?? res?.content ?? res?.markdown ?? JSON.stringify(res)
  } catch (error) {
    logger?.warn?.(error)
    return undefined
  }
}

async function gatherContext(section: SectionRuntime, mode: PressSearchMode): Promise<SectionContext> {
  if (mode === "skip") {
    return {
      ...section,
      sources: [],
      usedQueries: [],
    }
  }

  const usedQueries: string[] = []
  const collected: SectionSource[] = []
  for (const query of section.config.searchQueries) {
    usedQueries.push(query.query)
    try {
      const result = await fetchSerp(query.query)
      result.forEach((item: any) => {
        if (!item.url) return
        if (collected.find(existing => existing.url === item.url)) return
        collected.push({
          title: item.title,
          url: item.url,
          snippet: item.snippet,
          origin: query.label,
        })
      })
    } catch (error) {
      logger?.warn?.("SerpAPI error", error)
    }
  }

  const limited = collected.slice(0, 6)
  const hydrated = await Promise.all(limited.map(async (item) => {
    const content = await fetchReader(item.url)
    return {
      ...item,
      content,
    }
  }))

  return {
    ...section,
    sources: hydrated,
    usedQueries,
  }
}

function buildContextText(sources: SectionSource[]) {
  if (!sources.length) return "未检索到最新素材，可结合默认提示词生成概览。"
  return sources.map((source, index) => {
    const body = source.content?.slice(0, 1200) || ""
    return [
      `(${index + 1}) 标题：${source.title}`,
      source.origin ? `来源：${source.origin}` : "",
      `链接：${source.url}`,
      source.snippet ? `摘要：${source.snippet}` : "",
      body ? `正文节选：${body}` : "",
    ].filter(Boolean).join("\n")
  }).join("\n\n")
}

function buildPromptPayload(ctx: SectionContext) {
  const contextText = buildContextText(ctx.sources)
  const content = [
    `板块：${ctx.config.title}`,
    `目标时长：${ctx.durationMinutes} 分钟（约 ${ctx.targetWords} 字）`,
    `用户提示词：${ctx.prompt}`,
    "资料：",
    contextText,
    "写作要求：",
    "- 输出中文，语气为内部播报/主持口吻，段落精炼。",
    "- 结合资料进行编排，先给一句主题句，再给要点清单，优先引用最新素材。",
    "- 给出与公司战略、属地经营或廉政学习的关联。",
    "- 在文末列出引用的来源索引，格式为 [编号] 标题（URL）。",
  ].join("\n")

  return {
    messages: [
      {
        role: "system",
        content: "你是企业内宣/党务/政研的新闻稿智能体，负责串联分段播报。确保内容可直接用于班前会或晨会。",
      },
      {
        role: "user",
        content,
      },
    ],
  }
}

async function callDeepSeek(payload: { messages: { role: string, content: string }[] }) {
  const res: any = await $fetch(`${DEEPSEEK_API_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: {
      model: DEEPSEEK_MODEL,
      messages: payload.messages,
      temperature: 0.35,
    },
    timeout: 30000,
  })
  const message = res?.choices?.[0]?.message?.content ?? res?.data?.content
  if (!message) throw new Error("DeepSeek 响应为空")
  return message as string
}

function createLangChain() {
  const toPrompt: Runnable<SectionContext, { messages: { role: string, content: string }[] }> = async ctx => buildPromptPayload(ctx)
  const runModel: Runnable<{ messages: { role: string, content: string }[] }, string> = async payload => callDeepSeek(payload)
  const parse: Runnable<string, string> = async content => content.trim()

  return sequence<SectionContext, string>(toPrompt, runModel, parse)
}

function toResult(ctx: SectionContext, content: string): PressSectionResult {
  const references: PressReference[] = ctx.sources.map(source => ({
    title: source.title,
    url: source.url,
    snippet: source.snippet,
  }))

  return {
    id: ctx.config.id,
    title: ctx.config.title,
    durationMinutes: ctx.durationMinutes,
    targetWords: ctx.targetWords,
    content,
    references,
    usedQueries: ctx.usedQueries,
  }
}

export async function generatePressRelease(body: PressGenerationRequest): Promise<PressGenerationResponse> {
  const searchMode = body.searchMode ?? "web"
  assertEnv(searchMode)
  const sections = normalizeSections(body.sections)
  const contexts = await Promise.all(sections.map(section => gatherContext(section, searchMode)))
  const chain = createLangChain()

  const results: PressSectionResult[] = []
  for (const ctx of contexts) {
    const content = await chain(ctx)
    results.push(toResult(ctx, content))
  }

  return {
    sections: results,
    searchMode,
  }
}
