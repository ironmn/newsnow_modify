import type { PressGenerationRequest } from "@shared/press"
import { generatePressRelease } from "#/services/press"

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<PressGenerationRequest>(event)
    const data = await generatePressRelease(body ?? {})
    return data
  } catch (error: any) {
    logger.error(error)
    throw createError({
      statusCode: 500,
      message: error?.message ?? "生成新闻稿失败",
    })
  }
})
