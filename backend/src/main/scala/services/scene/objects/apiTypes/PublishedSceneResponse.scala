package services.scene.objects.apiTypes

import java.time.Instant

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

/**
 * 公开场景响应（api-contract §4.1）：来自 active 发布快照绑定的 succeeded SceneRun。
 * `generatedAt` 口径 = 运行最后一次状态迁移时间（run.updatedAt，即评审通过置 succeeded 的时刻），
 * 与 gallery 发布快照里的 `sceneGeneratedAt` 保持一致。
 */
final case class PublishedSceneResponse(
  code: String,
  runtimeVersion: String,
  generatedAt: Instant
)

object PublishedSceneResponse:
  given Encoder[PublishedSceneResponse] = deriveEncoder[PublishedSceneResponse]
  given Decoder[PublishedSceneResponse] = deriveDecoder[PublishedSceneResponse]
