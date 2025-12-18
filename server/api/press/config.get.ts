import { getPressConfigSnapshot } from "#/services/press-config"

export default defineEventHandler(async () => {
  return await getPressConfigSnapshot()
})
