package services.system.config

/** 场景生成与主观验收的可调参数。 */
final case class SceneConfig(reviewPassScore: Double, maxRevisions: Int, codeLimitKb: Int)

object SceneConfig:
  private val DefaultReviewPassScore = 3.0
  private val DefaultMaxRevisions = 2
  private val DefaultCodeLimitKb = 1024

  def fromEnvironment(environment: Map[String, String]): Either[String, SceneConfig] =
    for
      reviewPassScore <- EnvironmentVariables.double(environment, "REVIEW_PASS_SCORE", DefaultReviewPassScore)
      maxRevisions <- EnvironmentVariables.int(environment, "SCENE_MAX_REVISIONS", DefaultMaxRevisions)
      codeLimitKb <- EnvironmentVariables.int(environment, "SCENE_CODE_LIMIT_KB", DefaultCodeLimitKb)
    yield SceneConfig(reviewPassScore, maxRevisions, codeLimitKb)
