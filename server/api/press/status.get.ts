import { checkPressServiceStatus } from "#/services/press-config"

export default defineEventHandler(async () => {
  try {
    return await checkPressServiceStatus()
  } catch (error: any) {
    logger.error(error)
    throw createError({
      statusCode: 500,
      message: error?.message ?? "检查配置失败",
    })
  }
})
