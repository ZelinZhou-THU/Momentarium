package services.system.ai.ports

import cats.effect.IO

import services.curation.objects.PhotoAnalysis
import services.system.ai.objects.{ImageBytes, PhotoAnalysisPrompt}

/**
 * 视觉模型端口：单张照片的情绪与记忆分析（spec 10.1）。
 *
 * 对应 spec 6.5 的 `analyze(image: ImageRef, ...)`：AI 边界只接收已压缩的图片字节与 MIME，
 * 不传业务 ID，避免把 curation 的 photoId 带进提示词与出站请求。
 */
trait VisionModel:
  def analyze(image: ImageBytes, prompt: PhotoAnalysisPrompt): IO[PhotoAnalysis]
