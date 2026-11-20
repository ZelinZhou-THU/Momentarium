package services.system.ai.ports

import cats.effect.IO

import services.scene.objects.SceneReview
import services.system.ai.objects.{ImageBytes, ReviewPrompt}

/** 评审模型端口：只看渲染截图（2–3 张）做主客观评分（spec 9.5）。 */
trait ReviewModel:
  def review(prompt: ReviewPrompt, captures: List[ImageBytes]): IO[SceneReview]
