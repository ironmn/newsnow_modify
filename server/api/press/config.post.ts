import type { PressConfigSaveRequest } from "@shared/press"
import { savePressConfig } from "#/services/press-config"

export default defineEventHandler(async (event) => {
  try {
    const body = await readBody<PressConfigSaveRequest>(event)
    return await savePressConfig(body ?? {})
  } catch (error: any) {
    logger.error(error)
    throw createError({
      statusCode: 500,
      message: error?.message ?? "保存配置失败",
    })
  }
})
