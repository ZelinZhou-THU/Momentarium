package services.scene.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/**
 * 父智能体写出的场景题面（spec 9.2），持久化在 scene_runs.brief_json 并随运行返回。
 *
 * palette 用 #RRGGBB 字符串（api-contract §4.1）；spec §9.2 的 RgbColor 结构待 D4 与 Lead 对齐后统一。
 */
final case class SceneBrief(
  mood: String,
  memoryReading: String,
  scenePrompt: String,
  entranceNarration: String,
  palette: List[String],
  avoid: List[String],
  userHint: Option[String]
)

object SceneBrief:
  given Encoder[SceneBrief] = deriveEncoder[SceneBrief]
  given Decoder[SceneBrief] = deriveDecoder[SceneBrief]
