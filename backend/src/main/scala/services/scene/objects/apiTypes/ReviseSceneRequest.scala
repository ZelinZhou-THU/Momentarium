package services.scene.objects.apiTypes

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}

import services.scene.objects.SceneRunId

/**
 * revisescene 请求（api-contract v1.14 §4.1）：parentRunId 是用户修订所基于的当前采用运行；
 * instruction 去首尾空白后 1–500 个 Unicode 码点（允许换行与制表符）。
 */
final case class ReviseSceneRequest(parentRunId: SceneRunId, instruction: String)

object ReviseSceneRequest:
  given Encoder[ReviseSceneRequest] = deriveEncoder[ReviseSceneRequest]
  given Decoder[ReviseSceneRequest] = deriveDecoder[ReviseSceneRequest]
