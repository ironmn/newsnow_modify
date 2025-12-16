import type { NewsItem } from "@shared/types"

const SEARCH_URL = "https://so.news.cn/getNews"
const KEYWORD = "电力"
const PAGE_COUNT = 2
const HEADERS = {
  "accept": "application/json, text/plain, */*",
  "accept-language": "zh,en-US;q=0.9,en;q=0.8,zh-CN;q=0.7,ja;q=0.6",
  "sec-ch-ua": "\"Google Chrome\";v=\"143\", \"Chromium\";v=\"143\", \"Not A(Brand\";v=\"24\"",
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": "\"Windows\"",
  "sec-fetch-dest": "empty",
  "sec-fetch-mode": "cors",
  "sec-fetch-site": "same-origin",
  "cookie":
    "arialoadData=false; wdcid=6b6ed4d182813f2a; ariawapChangeViewPort=false; ariaFixed=true; ariaReadtype=1; ariaoldFixedStatus=false; ariaStatus=false; xinhuatoken=news; wdlast=1765807630",
  "Referer": "https://so.news.cn/",
}

interface RawResult {
  contentId?: string
  des?: string | null
  imgUrl?: string | null
  keyword?: string | null
  listResult?: unknown
  pubtime?: string
  sitename?: string
  title?: string
  url?: string
}

interface RawResponse {
  code?: number
  content?: {
    results?: RawResult[]
  }
}

function stripHtml(text?: string | null) {
  if (!text) return undefined
  return text.replace(/<[^>]*>/g, "").trim()
}

function parseDate(value?: string | null) {
  if (!value) return undefined
  const ts = Date.parse(value.replace(/\//g, "-"))
  return Number.isNaN(ts) ? undefined : ts
}

function buildItem(entry: RawResult): NewsItem | undefined {
  const link = entry.url?.trim()
  const title = stripHtml(entry.title)
  if (!link || !title) return undefined

  return {
    id: entry.contentId ?? link,
    title,
    url: link,
    mobileUrl: link,
    pubDate: parseDate(entry.pubtime),
  }
}

export default defineSource(async () => {
  const items = new Map<string | number, NewsItem>()

  for (let page = 1; page <= PAGE_COUNT; page += 1) {
    const url = new URL(SEARCH_URL)
    url.searchParams.set("lang", "cn")
    url.searchParams.set("curPage", String(page))
    url.searchParams.set("searchFields", "0")
    url.searchParams.set("sortField", "0")
    url.searchParams.set("keyword", KEYWORD)

    const res = await myFetch<RawResponse>(url.toString(), {
      headers: HEADERS,
    })

    const results = res.content?.results ?? []
    for (const entry of results) {
      const item = buildItem(entry)
      if (!item || items.has(item.id)) continue
      items.set(item.id, item)
    }
  }

  const sorted = Array.from(items.values()).sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
  if (sorted.length === 0) throw new Error("No xinhua energy results")
  return sorted.slice(0, 20)
})
