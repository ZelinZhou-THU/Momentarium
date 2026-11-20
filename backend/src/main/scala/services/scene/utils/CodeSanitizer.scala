package services.scene.utils

import java.nio.charset.StandardCharsets

/**
 * 模型代码的基础清洗与结构校验（spec 9.3）：markdown 围栏、空代码、大小、入口结构、HTML 片段。
 * 完整硬门禁（无运行时错误 / 照片覆盖 / 无网络 / fps）在 reviewscene 阶段校验，不在这里。
 */
private[scene] object CodeSanitizer:

  private val ForbiddenHtmlMarkers = List("<script", "<html", "<!doctype", "<body", "<div", "<img")

  def sanitize(rawOutput: String, codeLimitKb: Int): Either[String, String] =
    val code = stripCodeFences(rawOutput)
    if code.isEmpty then Left("模型返回空代码")
    else if code.getBytes(StandardCharsets.UTF_8).length > codeLimitKb * 1024 then
      Left(s"代码超过 $codeLimitKb KB 上限")
    else if !code.contains("function build(") then Left("缺少 function build(ctx) 入口")
    else if !code.contains("ctx") then Left("代码没有使用 ctx 契约")
    else if code.contains("```") then Left("代码仍包含 markdown 围栏")
    else
      val lower = code.toLowerCase
      ForbiddenHtmlMarkers.find(marker => lower.contains(marker)) match
        case Some(marker) => Left(s"代码包含 HTML 片段（$marker）")
        case None => Right(code)

  /** 去掉 ```js / ``` 包裹与首尾空白（模型经常无视“不要围栏”的要求）。 */
  def stripCodeFences(raw: String): String =
    raw.trim
      .replaceFirst("(?s)^```[a-zA-Z]*\\s*", "")
      .replaceFirst("(?s)\\s*```\\s*$", "")
      .trim
