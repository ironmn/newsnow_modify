import process from "node:process"
import fs from "node:fs"
import { dirname, join } from "node:path"
import Database from "better-sqlite3"
import { $fetch } from "ofetch"
import { projectDir } from "@shared/dir"
import type {
  PressApiConfig,
  PressConfigSaveResponse,
  PressConfigSnapshot,
  PressConfigSource,
  PressConfigStatus,
  PressConfigStatusResponse,
} from "@shared/press"
import { myFetch as request } from "#/utils/fetch"

export type PressRuntimeConfig = PressApiConfig & { source: PressConfigSource, deepseekApiBase: string, deepseekModel: string }

const DB_PATH = process.env.PRESS_CONFIG_DB_PATH ?? join(projectDir, "press-config.db")
const DB_ID = "default"

interface DBRow {
  id: string
  serp_api_key?: string
  reader_api_key?: string
  deepseek_api_key?: string
  deepseek_api_base?: string
  deepseek_model?: string
  updated?: number
}

function ensureDir(filePath: string) {
  const dir = dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function openDatabase(allowCreate: boolean): Database | undefined {
  const exists = fs.existsSync(DB_PATH)
  if (!exists && !allowCreate) return undefined
  ensureDir(DB_PATH)
  const db = new Database(DB_PATH)
  db.exec(`
    CREATE TABLE IF NOT EXISTS press_config (
      id TEXT PRIMARY KEY,
      serp_api_key TEXT,
      reader_api_key TEXT,
      deepseek_api_key TEXT,
      deepseek_api_base TEXT,
      deepseek_model TEXT,
      updated INTEGER
    );
  `)
  return db
}

function normalizeValue(value?: string) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function hasValue(config?: PressApiConfig) {
  if (!config) return false
  return Boolean(
    config.serpApiKey
    || config.readerApiKey
    || config.deepseekApiKey
    || config.deepseekApiBase
    || config.deepseekModel,
  )
}

function rowToConfig(row?: DBRow): PressApiConfig | undefined {
  if (!row) return undefined
  return {
    serpApiKey: normalizeValue(row.serp_api_key),
    readerApiKey: normalizeValue(row.reader_api_key),
    deepseekApiKey: normalizeValue(row.deepseek_api_key),
    deepseekApiBase: normalizeValue(row.deepseek_api_base),
    deepseekModel: normalizeValue(row.deepseek_model),
    updatedAt: row.updated,
  }
}

function readFromDB(): PressApiConfig | undefined {
  const db = openDatabase(false)
  if (!db) return undefined
  try {
    const row = db.prepare(`SELECT * FROM press_config WHERE id = ?`).get(DB_ID) as DBRow | undefined
    return rowToConfig(row)
  } finally {
    db.close()
  }
}

function writeToDB(config: PressApiConfig): PressApiConfig {
  const db = openDatabase(true)
  if (!db) throw new Error("数据库打开失败")
  const now = Date.now()
  try {
    db.prepare(`
      INSERT INTO press_config (id, serp_api_key, reader_api_key, deepseek_api_key, deepseek_api_base, deepseek_model, updated)
      VALUES (@id, @serp_api_key, @reader_api_key, @deepseek_api_key, @deepseek_api_base, @deepseek_model, @updated)
      ON CONFLICT(id) DO UPDATE SET
        serp_api_key = excluded.serp_api_key,
        reader_api_key = excluded.reader_api_key,
        deepseek_api_key = excluded.deepseek_api_key,
        deepseek_api_base = excluded.deepseek_api_base,
        deepseek_model = excluded.deepseek_model,
        updated = excluded.updated;
    `).run({
      id: DB_ID,
      serp_api_key: normalizeValue(config.serpApiKey),
      reader_api_key: normalizeValue(config.readerApiKey),
      deepseek_api_key: normalizeValue(config.deepseekApiKey),
      deepseek_api_base: normalizeValue(config.deepseekApiBase),
      deepseek_model: normalizeValue(config.deepseekModel),
      updated: now,
    })
    return {
      ...config,
      updatedAt: now,
    }
  } finally {
    db.close()
  }
}

function readEnvConfig(): PressApiConfig {
  return {
    serpApiKey: normalizeValue(process.env.SERPAPI_API_KEY),
    readerApiKey: normalizeValue(process.env.READER_API_KEY),
    deepseekApiKey: normalizeValue(process.env.DEEPSEEK_API_KEY),
    deepseekApiBase: normalizeValue(process.env.DEEPSEEK_API_BASE),
    deepseekModel: normalizeValue(process.env.DEEPSEEK_MODEL),
  }
}

export async function getPressConfigSnapshot(): Promise<PressConfigSnapshot> {
  const envConfig = readEnvConfig()
  const dbConfig = readFromDB()
  const config = dbConfig ?? (hasValue(envConfig) ? envConfig : undefined)
  const source: PressConfigSource = dbConfig ? "db" : (hasValue(envConfig) ? "env" : "none")

  return {
    config,
    source,
    dbExists: fs.existsSync(DB_PATH),
  }
}

export async function savePressConfig(payload: PressApiConfig): Promise<PressConfigSaveResponse> {
  const saved = writeToDB(payload)
  return {
    config: saved,
    source: "db",
    dbExists: true,
  }
}

export async function resolvePressRuntimeConfig(): Promise<PressRuntimeConfig> {
  const snapshot = await getPressConfigSnapshot()
  const envConfig = readEnvConfig()
  const merged: PressApiConfig = {
    serpApiKey: snapshot.config?.serpApiKey ?? envConfig.serpApiKey,
    readerApiKey: snapshot.config?.readerApiKey ?? envConfig.readerApiKey,
    deepseekApiKey: snapshot.config?.deepseekApiKey ?? envConfig.deepseekApiKey,
    deepseekApiBase: snapshot.config?.deepseekApiBase ?? envConfig.deepseekApiBase ?? "https://api.deepseek.com",
    deepseekModel: snapshot.config?.deepseekModel ?? envConfig.deepseekModel ?? "deepseek-chat",
    updatedAt: snapshot.config?.updatedAt,
  }

  return {
    ...merged,
    deepseekApiBase: merged.deepseekApiBase ?? "https://api.deepseek.com",
    deepseekModel: merged.deepseekModel ?? "deepseek-chat",
    source: snapshot.source,
  }
}

async function pingSerp(apiKey: string): Promise<PressConfigStatus> {
  const started = Date.now()
  const url = new URL("https://serpapi.com/search")
  url.searchParams.set("engine", "google")
  url.searchParams.set("q", "site:news.cctv.com (测试)")
  url.searchParams.set("api_key", apiKey)
  url.searchParams.set("num", "1")

  try {
    const res: any = await request(url.toString())
    const ok = Boolean(res?.search_metadata || res?.organic_results)
    return {
      id: "serpapi",
      label: "SerpAPI 搜索",
      ok,
      latencyMs: Date.now() - started,
      checkedAt: Date.now(),
      message: ok ? "可用" : "返回异常",
    }
  } catch (error: any) {
    return {
      id: "serpapi",
      label: "SerpAPI 搜索",
      ok: false,
      latencyMs: Date.now() - started,
      checkedAt: Date.now(),
      message: error?.data?.error ?? error?.message ?? "请求失败",
    }
  }
}

async function pingReader(apiKey: string): Promise<PressConfigStatus> {
  const started = Date.now()
  try {
    await request("https://open.bigmodel.cn/api/paas/v4/reader", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 12000,
      body: {
        url: "https://example.com",
        timeout: 10,
        no_cache: true,
        return_format: "markdown",
      },
    })
    return {
      id: "reader",
      label: "智谱 Reader",
      ok: true,
      latencyMs: Date.now() - started,
      checkedAt: Date.now(),
      message: "可用",
    }
  } catch (error: any) {
    return {
      id: "reader",
      label: "智谱 Reader",
      ok: false,
      latencyMs: Date.now() - started,
      checkedAt: Date.now(),
      message: error?.data?.message ?? error?.message ?? "请求失败",
    }
  }
}

async function pingDeepSeek(config: PressApiConfig): Promise<PressConfigStatus> {
  const started = Date.now()
  try {
    await $fetch(`${config.deepseekApiBase ?? "https://api.deepseek.com"}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.deepseekApiKey}`,
        "Content-Type": "application/json",
      },
      body: {
        model: config.deepseekModel ?? "deepseek-chat",
        messages: [{ role: "user", content: "ping" }],
        temperature: 0,
        max_tokens: 20,
      },
      timeout: 12000,
    })
    return {
      id: "deepseek",
      label: "DeepSeek 生成",
      ok: true,
      latencyMs: Date.now() - started,
      checkedAt: Date.now(),
      message: "可用",
    }
  } catch (error: any) {
    return {
      id: "deepseek",
      label: "DeepSeek 生成",
      ok: false,
      latencyMs: Date.now() - started,
      checkedAt: Date.now(),
      message: error?.data?.message ?? error?.message ?? "请求失败",
    }
  }
}

export async function checkPressServiceStatus(): Promise<PressConfigStatusResponse> {
  const runtime = await resolvePressRuntimeConfig()
  const statuses: PressConfigStatus[] = []

  if (runtime.serpApiKey) {
    statuses.push(await pingSerp(runtime.serpApiKey))
  } else {
    statuses.push({
      id: "serpapi",
      label: "SerpAPI 搜索",
      ok: false,
      message: "缺少 SerpAPI API key",
      checkedAt: Date.now(),
    })
  }

  if (runtime.readerApiKey) {
    statuses.push(await pingReader(runtime.readerApiKey))
  } else {
    statuses.push({
      id: "reader",
      label: "智谱 Reader",
      ok: false,
      message: "缺少 Reader API key",
      checkedAt: Date.now(),
    })
  }

  if (runtime.deepseekApiKey) {
    statuses.push(await pingDeepSeek(runtime))
  } else {
    statuses.push({
      id: "deepseek",
      label: "DeepSeek 生成",
      ok: false,
      message: "缺少 DeepSeek API key",
      checkedAt: Date.now(),
    })
  }

  return {
    source: runtime.source,
    statuses,
  }
}
