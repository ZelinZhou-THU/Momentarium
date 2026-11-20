package services.scene.objects

import java.util.UUID

import io.circe.{Decoder, Encoder}
import scala.util.Try

/** 场景运行标识，序列化为 UUID 字符串（与 scene.scene_runs.id 对应）。 */
final case class SceneRunId(value: UUID)

object SceneRunId:
  given Encoder[SceneRunId] = Encoder.encodeString.contramap(_.value.toString)

  given Decoder[SceneRunId] = Decoder.decodeString.emap { raw =>
    Try(UUID.fromString(raw)).toEither.left.map(_ => s"非法的场景运行 ID: $raw").map(SceneRunId.apply)
  }
