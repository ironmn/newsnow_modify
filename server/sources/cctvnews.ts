import * as cheerio from "cheerio"

import type { NewsItem } from "@shared/types"

const BASE_URL = "https://news.cctv.com"
const CHINA_PATH = "/china/"
const JSONP_ENDPOINTS = [
  `${BASE_URL}/2019/07/gaiban/cmsdatainterface/page/china_1.jsonp?cb=china`,
]

function normalizeUrl(url?: string) {
  if (!url) return undefined
  if (url.startsWith("http")) return url
  if (url.startsWith("//")) return `https:${url}`
  if (url.startsWith("/")) return `${BASE_URL}${url}`
  return url
}

function stripQuery(url: string) {
  try {
    const u = new URL(url)
    u.search = ""
    u.hash = ""
    return u.toString()
  } catch {
    return url
  }
}

function parseDateFromPath(url: string) {
  const dateMatch = url.match(/\/(20\d{2})\/(\d{2})\/(\d{2})\//)
  if (!dateMatch) return undefined

  const [, year, month, day] = dateMatch
  const isoDate = `${year}-${month}-${day}`
  const timestamp = Date.parse(isoDate)
  return Number.isNaN(timestamp) ? undefined : timestamp
}

function parseTimestamp(value?: string | number | null) {
  if (value == null) return undefined

  if (typeof value === "number") return value

  const trimmed = value.trim()
  if (!trimmed) return undefined

  // If it already looks like a millisecond timestamp
  if (/^\d{13}$/.test(trimmed)) return Number(trimmed)

  const parsed = Date.parse(trimmed)
  return Number.isNaN(parsed) ? undefined : parsed
}

function parseJSONP(text: string) {
  const start = text.indexOf("(")
  const end = text.lastIndexOf(")")

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Unexpected JSONP payload")
  }

  const json = text.slice(start + 1, end)
  return JSON.parse(json)
}

function buildFromRecord(record: Record<string, unknown>): NewsItem | undefined {
  const title = (record.title as string | undefined)?.trim()
    || (record.topic as string | undefined)?.trim()
    || (record.desc as string | undefined)?.trim()

  const link = (record.url as string | undefined)
    || (record.link as string | undefined)
    || (record.href as string | undefined)
    || (record.docurl as string | undefined)

  const normalized = normalizeUrl(link)
  if (!normalized || !title) return undefined

  const cleaned = stripQuery(normalized)
  const pubDate = parseTimestamp(record.focus_date as string | number | undefined)
    || parseTimestamp(record.publish_time as string | number | undefined)
    || parseTimestamp(record.pub_time as string | number | undefined)
    || parseTimestamp(record.ctime as string | number | undefined)
    || parseDateFromPath(cleaned)

  return {
    id: cleaned,
    title,
    url: cleaned,
    mobileUrl: (record.murl as string | undefined) || cleaned,
    pubDate,
  }
}

function parseJSONPItems(payload: unknown) {
  const data = (payload as { data?: { list?: unknown } }).data ?? payload
  const list = Array.isArray((data as { list?: unknown }).list)
    ? ((data as { list?: unknown[] }).list ?? [])
    : []

  const items: NewsItem[] = []
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue
    const item = buildFromRecord(entry as Record<string, unknown>)
    if (item) items.push(item)
  }

  return items
}

function buildNewsItem(link: string, title?: string): NewsItem | undefined {
  const normalized = normalizeUrl(link)
  if (!normalized) return undefined

  const cleaned = stripQuery(normalized)
  const pubDate = parseDateFromPath(cleaned)
  if (!pubDate) return undefined

  const text = title?.trim()
  if (!text) return undefined

  return {
    id: cleaned,
    title: text,
    url: cleaned,
    mobileUrl: cleaned,
    pubDate,
  }
}

export default defineSource(async () => {
  const newsMap = new Map<string | number, NewsItem>()

  for (const endpoint of JSONP_ENDPOINTS) {
    try {
      const text = await myFetch<string>(endpoint, { responseType: "text" })
      const payload = parseJSONP(text)
      const items = parseJSONPItems(payload)

      for (const item of items) {
        if (!item || newsMap.has(item.id)) continue
        newsMap.set(item.id, item)
      }
    } catch (error) {
      if (!(error instanceof Error)) throw error
      continue
    }

    if (newsMap.size >= 30) break
  }

  // Fallback to HTML scraping if JSONP returns nothing
  if (newsMap.size === 0) {
    const htmlEndpoints = [`${BASE_URL}${CHINA_PATH}`]

    for (const endpoint of htmlEndpoints) {
      try {
        const html = await myFetch<string>(endpoint, {
          responseType: "text",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Referer": `${BASE_URL}/`,
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
          },
        })

        const $ = cheerio.load(html)

        $("a").each((_, el) => {
          const rawHref = $(el).attr("href") || ""
          const title = $(el).text().trim() || $(el).attr("title")?.trim()

          const item = buildNewsItem(rawHref, title)
          if (!item || newsMap.has(item.id)) return

          newsMap.set(item.id, item)
        })
      } catch (error) {
        if (!(error instanceof Error)) throw error
        continue
      }

      if (newsMap.size >= 30) break
    }
  }

  const sorted = Array.from(newsMap.values()).sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
  if (sorted.length === 0) throw new Error("Failed to fetch CCTV News feed")

  return sorted.slice(0, 30)
})
