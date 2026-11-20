package services.scene.utils

import java.nio.charset.StandardCharsets

import services.system.ai.objects.TextPrompt

/**
 * 修订请求的容量校验（api-contract v1.14 §4.1 / spec §10.6）：
 * - 父代码不静默截断：超过配置的代码上限（SCENE_CODE_LIMIT_KB，默认 1 MiB）即拒绝；
 * - 完整提示词按 UTF-8 字节计 ≤2 MiB（含父代码、题面、指令、参考片段与转义）；
 * - 模型上下文预算：无精确 token 计数器时按 3 UTF-8 字节/token 保守估算输入 token，
 *   超过保守上下文预算（预留输出空间）即拒绝；绝不发送必定超限的请求，也不改为从头生成。
 *
 * 纯函数，Failure 信息只描述容量与上限，不回显父代码/指令内容。
 */
private[scene] object SceneRevisionCapacity:

  /** 单 token 至少覆盖的 UTF-8 字节数：按 3 估算 = 对 token 数的保守高估（中英混排实际通常更少）。 */
  val ConservativeBytesPerToken: Long = 3

  /** 保守上下文预算：为输出与推理预留空间后，允许的输入 token 上限。 */
  val ConservativeContextTokens: Long = 96_000

  /** 返回 Left(容量错误说明) 时调用方应返回 400 SCENE_REVISION_TOO_LARGE。 */
  def check(parentCode: String, prompt: TextPrompt, codeLimitKb: Int): Either[String, Unit] =
    val codeBytes = utf8Bytes(parentCode)
    val codeLimitBytes = codeLimitKb.toLong * 1024
    val promptBytes = utf8Bytes(prompt.instructions)
    if codeBytes > codeLimitBytes then
      Left(s"父运行代码超过代码上限（${codeBytes} > ${codeLimitBytes} 字节），修订不会静默截断")
    else if promptBytes > SceneContract.MaxRevisionPromptBytes then
      Left(s"修订请求超过 ${SceneContract.MaxRevisionPromptBytes} 字节上限（${promptBytes} 字节）")
    else if estimatedTokens(promptBytes) > ConservativeContextTokens then
      Left(
        s"修订请求按保守估算约 ${estimatedTokens(promptBytes)} tokens，超出模型上下文预算 ${ConservativeContextTokens} tokens"
      )
    else Right(())

  def utf8Bytes(text: String): Long = text.getBytes(StandardCharsets.UTF_8).length.toLong

  def estimatedTokens(promptBytes: Long): Long =
    (promptBytes + ConservativeBytesPerToken - 1) / ConservativeBytesPerToken
