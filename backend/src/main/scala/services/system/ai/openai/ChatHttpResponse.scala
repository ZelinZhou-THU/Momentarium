package services.system.ai.openai

/** 网关 HTTP 响应：logId 来自 x-opencode-log-id，用于排障与成本核对。 */
private[ai] final case class ChatHttpResponse(status: Int, body: String, logId: Option[String])
