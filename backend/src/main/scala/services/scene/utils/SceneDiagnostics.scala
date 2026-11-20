package services.scene.utils

import java.nio.charset.StandardCharsets
import java.nio.file.{Files, Path}

import cats.effect.IO
import io.circe.Json
import io.circe.syntax.*
import org.slf4j.LoggerFactory

import services.scene.objects.{SceneReview, SceneRun}

/**
 * 被拒代码的本地留存：修订或兜底会覆盖库里的 code，失败那一版就再也看不到了。
 * 每轮未通过时把当轮代码与裁决原因写到 DATA_DIR/scene-diagnostics/<runId>/，只供本机复盘，不进入任何接口。
 * 写盘失败只记日志，不影响评审流程。
 */
private[scene] object SceneDiagnostics:

  private val logger = LoggerFactory.getLogger(getClass)
  private val DirectoryName = "scene-diagnostics"

  def recordRejected(
    dataDir: Path,
    run: SceneRun,
    outcome: ReviewOutcome,
    gateIssues: List[String],
    modelFailure: Option[String]
  ): IO[Unit] =
    outcomeLabel(outcome) match
      case None => IO.unit
      case Some(label) =>
        val directory = dataDir.resolve(DirectoryName).resolve(run.id.value.toString)
        val stem = s"attempt-${run.attempts}-build-${run.buildRepairs}"
        val record = Json.obj(
          "runId" -> run.id.value.toString.asJson,
          "attempts" -> run.attempts.asJson,
          "buildRepairs" -> run.buildRepairs.asJson,
          "outcome" -> label.asJson,
          "gateIssues" -> gateIssues.asJson,
          "modelFailure" -> modelFailure.asJson,
          "review" -> reviewOf(outcome).asJson
        )
        IO.blocking {
          Files.createDirectories(directory)
          Files.writeString(directory.resolve(s"$stem.js"), run.code.getOrElse(""), StandardCharsets.UTF_8)
          Files.writeString(directory.resolve(s"$stem.json"), record.spaces2, StandardCharsets.UTF_8)
        }.void
          .handleErrorWith(error => IO(logger.warn(s"场景诊断留存失败（不影响评审）：runId=${run.id.value}，${error.getMessage}")))

  private def outcomeLabel(outcome: ReviewOutcome): Option[String] =
    outcome match
      case ReviewOutcome.Passed(_) => None
      case ReviewOutcome.Revise(_, _) => Some("revise")
      case ReviewOutcome.RepairBuild(_, _) => Some("repair-build")
      case ReviewOutcome.Fallback(_) => Some("fallback")

  private def reviewOf(outcome: ReviewOutcome): Option[SceneReview] =
    outcome match
      case ReviewOutcome.Passed(review) => Some(review)
      case ReviewOutcome.Revise(review, _) => Some(review)
      case ReviewOutcome.RepairBuild(review, _) => Some(review)
      case ReviewOutcome.Fallback(review) => review
