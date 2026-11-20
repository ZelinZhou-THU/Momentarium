package services.system.ai.ports

import cats.effect.IO
import io.circe.Decoder

import services.system.ai.objects.{StructuredPrompt, TextPrompt}

/**
 * 文本模型端口：结构化输出优先 JSON 模式，失败降级为提示词约束 JSON 并重试。
 *
 * 模型选择：`structured` 用 AI_TEXT_MODEL（题面/策展类结构化输出），
 * `complete` 用 AI_CODE_MODEL（场景代码等自由文本生成）。
 */
trait TextModel:
  def structured[A: Decoder](prompt: StructuredPrompt): IO[A]

  def complete(prompt: TextPrompt): IO[String]
