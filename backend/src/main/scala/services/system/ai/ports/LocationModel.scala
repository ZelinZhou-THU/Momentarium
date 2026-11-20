package services.system.ai.ports

import cats.effect.IO

import services.system.ai.objects.{ImageBytes, LocationCandidateDrafts, LocationCandidatePrompt}

/** 地点识别端口（阶段 3）：根据单张照片建议最多 3 个地点候选。
  *
  * 与 VisionModel.analyze 独立，允许单独替换/失败；AI 边界只接收已压缩图片字节与 MIME，不传业务 ID。
  * 返回原始 draft（未校验），校验与落库由 curation 消息负责。
  */
trait LocationModel:
  def suggestCandidates(image: ImageBytes, prompt: LocationCandidatePrompt): IO[LocationCandidateDrafts]
