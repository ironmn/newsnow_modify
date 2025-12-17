import process from "node:process"
import type { NewsItem } from "@shared/types"
import type { Database } from "db0"
import type { CacheInfo, CacheRow } from "../types"

interface CacheLike {
  init: () => Promise<void>
  set: (key: string, value: NewsItem[]) => Promise<void>
  get: (key: string) => Promise<CacheInfo | undefined>
  getEntire: (keys: string[]) => Promise<CacheInfo[]>
  delete: (key: string) => Promise<unknown>
}

export class Cache implements CacheLike {
  private db
  constructor(db: Database) {
    this.db = db
  }

  async init() {
    await this.db.prepare(`
      CREATE TABLE IF NOT EXISTS cache (
        id TEXT PRIMARY KEY,
        updated INTEGER,
        data TEXT
      );
    `).run()
    logger.success(`init cache table`)
  }

  async set(key: string, value: NewsItem[]) {
    const now = Date.now()
    await this.db.prepare(
      `INSERT OR REPLACE INTO cache (id, data, updated) VALUES (?, ?, ?)`,
    ).run(key, JSON.stringify(value), now)
    logger.success(`set ${key} cache`)
  }

  async get(key: string): Promise<CacheInfo | undefined > {
    const row = (await this.db.prepare(`SELECT id, data, updated FROM cache WHERE id = ?`).get(key)) as CacheRow | undefined
    if (row) {
      logger.success(`get ${key} cache`)
      return {
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data),
      }
    }
  }

  async getEntire(keys: string[]): Promise<CacheInfo[]> {
    const keysStr = keys.map(k => `id = '${k}'`).join(" or ")
    const res = await this.db.prepare(`SELECT id, data, updated FROM cache WHERE ${keysStr}`).all() as any
    const rows = (res.results ?? res) as CacheRow[]

    /**
     * https://developers.cloudflare.com/d1/build-with-d1/d1-client-api/#return-object
     * cloudflare d1 .all() will return
     * {
     *   success: boolean
     *   meta:
     *   results:
     * }
     */
    if (rows?.length) {
      logger.success(`get entire (...) cache`)
      return rows.map(row => ({
        id: row.id,
        updated: row.updated,
        items: JSON.parse(row.data) as NewsItem[],
      }))
    } else {
      return []
    }
  }

  async delete(key: string) {
    return await this.db.prepare(`DELETE FROM cache WHERE id = ?`).run(key)
  }
}

class InMemoryCache implements CacheLike {
  private store = new Map<string, CacheInfo>()

  async init() {}

  async set(key: string, items: NewsItem[]) {
    this.store.set(key, { id: key, updated: Date.now(), items })
    logger.success(`set ${key} cache (memory)`) // match logging behavior
  }

  async get(key: string) {
    const value = this.store.get(key)
    if (value) logger.success(`get ${key} cache (memory)`)
    return value
  }

  async getEntire(keys: string[]) {
    return keys
      .map(key => this.store.get(key))
      .filter((value): value is CacheInfo => Boolean(value))
  }

  async delete(key: string) {
    this.store.delete(key)
  }
}

let memoryCache: InMemoryCache | undefined

export async function getCacheTable(): Promise<CacheLike | undefined> {
  if (process.env.ENABLE_CACHE === "false") return

  try {
    const db = useDatabase()
    const cacheTable = new Cache(db)
    if (process.env.INIT_TABLE !== "false") await cacheTable.init()
    return cacheTable
  } catch (e) {
    logger.error("failed to init database ", e)
  }

  if (!memoryCache) memoryCache = new InMemoryCache()
  return memoryCache
}
