package services.system.ai.fake

import cats.effect.IO

import services.scene.objects.{ReviewVerdict, RubricScores, SceneReview}
import services.system.ai.objects.{ImageBytes, ReviewPrompt}
import services.system.ai.ports.ReviewModel

/** 确定性评审模型（AI_MODE=fake / 测试）：返回构造时给定的五维分数与固定通过结论。 */
final class FakeReviewModel(scores: RubricScores = RubricScores(4, 4, 4, 4, 4)) extends ReviewModel:

  override def review(prompt: ReviewPrompt, captures: List[ImageBytes]): IO[SceneReview] =
    IO.pure(
      SceneReview(
        scores = scores,
        verdict = ReviewVerdict.Pass,
        issues = Nil,
        summary = "确定性评审：场景完整、照片齐全、构图与光影达到通过标准。"
      )
    )
