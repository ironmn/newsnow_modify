import * as cheerio from "cheerio"

import type { NewsItem } from "@shared/types"

const BASE_URL = "https://news.cctv.com"
const CHINA_PATH = "/china/"

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
  const currentYear = new Date().getFullYear()
  const yearNum = Number(year)

  // Skip obviously stale archives (e.g., old 2019 URLs still linked from templates)
  if (Number.isNaN(yearNum) || yearNum < currentYear - 1 || yearNum > currentYear) return undefined

  const isoDate = `${year}-${month}-${day}`
  const timestamp = Date.parse(isoDate)
  return Number.isNaN(timestamp) ? undefined : timestamp
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

  const sorted = Array.from(newsMap.values()).sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
  if (sorted.length === 0) throw new Error("Failed to fetch CCTV News feed")

  return sorted.slice(0, 30)
})
