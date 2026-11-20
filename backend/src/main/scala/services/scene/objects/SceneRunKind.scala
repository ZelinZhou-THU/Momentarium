package services.scene.objects

import io.circe.{Decoder, Encoder}

/**
 * 场景运行起因（api-contract v1.14 / spec §7 `scene.scene_runs.kind`）：
 * - `generate`：用户主动生成（含 fake 兜底路径）；
 * - `revise`：从当前采用场景出发的自然语言修订（成功只是候选，不自动切当前指针）；
 * - `restore`：由版本历史恢复旧运行产生的克隆。
 *
 * 与 `source=ai|fallback`（产物来源）相互独立，不能互相推导；DB 与 API 均用小写字符串。
 */
enum SceneRunKind:
  case Generate
  case Revise
  case Restore

object SceneRunKind:
  def toString(kind: SceneRunKind): String =
    kind match
      case SceneRunKind.Generate => "generate"
      case SceneRunKind.Revise => "revise"
      case SceneRunKind.Restore => "restore"

  def fromString(value: String): Either[String, SceneRunKind] =
    value.trim.toLowerCase match
      case "generate" => Right(SceneRunKind.Generate)
      case "revise" => Right(SceneRunKind.Revise)
      case "restore" => Right(SceneRunKind.Restore)
      case other => Left(s"不支持的场景运行种类: $other")

  given Encoder[SceneRunKind] = Encoder.encodeString.contramap(toString)

  given Decoder[SceneRunKind] = Decoder.decodeString.emap(fromString)
