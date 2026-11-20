package services.system.ai.openai

/** 传输层失败：看门狗超时不可重试，网络错误按指数退避重试（≤2）。 */
private[ai] enum ChatFailure:
  case Timeout
  case Network(detail: String)
