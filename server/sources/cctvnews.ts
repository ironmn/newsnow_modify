import type { NewsItem } from "@shared/types"

interface CCTVNewsItem {
  id?: string
  title?: string
  url?: string
  link?: string
  href?: string
  client_url?: string
  mobile_url?: string
  mobileUrl?: string
  pubDate?: string
  publishdate?: string
  publish_time?: string
  focus_date?: string
  date?: string
}

type CCTVNewsPayload =
  | CCTVNewsItem[]
  | {
    list?: CCTVNewsItem[]
    data?: CCTVNewsItem[]
    items?: CCTVNewsItem[]
  }

interface CCTVNewsResponse {
  data?: CCTVNewsPayload
  list?: CCTVNewsItem[]
  page?: { data?: CCTVNewsItem[] }
}

function normalizeUrl(url?: string) {
  if (!url) return undefined
  if (url.startsWith("http")) return url
  if (url.startsWith("//")) return `https:${url}`
  if (url.startsWith("/")) return `https://news.cctv.com${url}`
  return url
}

function parseJsonPayload(raw: string): CCTVNewsResponse {
  const trimmed = raw.trim()
  const jsonText = trimmed.replace(/^[^(]*\(/, "").replace(/\)\s*;?$/, "") || trimmed
  return JSON.parse(jsonText)
}

function extractItems(payload: CCTVNewsResponse): CCTVNewsItem[] {
  const nested = payload.data as CCTVNewsResponse["data"]
  const list = Array.isArray(nested)
    ? nested
    : [nested?.list, nested?.data, nested?.items].find(Array.isArray) ?? []

  return [
    ...(Array.isArray(list) ? list : []),
    ...(Array.isArray(payload.list) ? payload.list : []),
    ...(Array.isArray(payload.page?.data) ? payload.page!.data! : []),
  ]
}

export default defineSource(async () => {
  const endpoint = "https://news.cctv.com/2019/07/gaiban/cmsdatainterface/page/china_1.jsonp?cb=china"
  const rawResponse = await myFetch<string | CCTVNewsResponse>(endpoint, { responseType: "text" })

  const payload = typeof rawResponse === "string" ? parseJsonPayload(rawResponse) : rawResponse
  const items = extractItems(payload)

  const newsMap = new Map<string | number, NewsItem>()

  items.forEach((item) => {
    const title = item.title?.trim()
    const link = normalizeUrl(item.url ?? item.link ?? item.href)

    if (!title || !link) return

    const dateString = item.focus_date ?? item.pubDate ?? item.publish_time ?? item.publishdate ?? item.date
    let pubDate: number | undefined
    if (dateString) {
      try {
        pubDate = tranformToUTC(dateString)
      } catch {
        pubDate = undefined
      }
    }
    const id = item.id ?? link
    const mobileUrl = normalizeUrl(item.client_url ?? item.mobileUrl ?? item.mobile_url) ?? link

    if (!newsMap.has(id)) {
      newsMap.set(id, {
        id,
        title,
        url: link,
        mobileUrl,
        pubDate,
      })
    }
  })

  return Array.from(newsMap.values()).sort((a, b) => (b.pubDate ?? 0) - (a.pubDate ?? 0))
})
