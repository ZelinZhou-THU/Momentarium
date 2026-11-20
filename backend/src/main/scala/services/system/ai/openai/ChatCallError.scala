package services.system.ai.openai

/** 一次模型调用的最终失败（重试已用尽）：status 为 None 表示网络/超时；reason 只进日志，不进前端。 */
private[ai] final case class ChatCallError(status: Option[Int], reason: String)
