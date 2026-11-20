package services.scene.tables

import java.sql.{Connection, ResultSet}
import java.time.Instant
import java.util.UUID

import cats.effect.IO
import io.circe.Json
import io.circe.syntax.*

import services.gallery.objects.{ExhibitionId, PhotoId}
import services.scene.objects.*
import services.scene.objects.apiTypes.RuntimeEvidence
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/**
 * scene.scene_runs 的公开表方法（返回 IO[T]，不含业务逻辑）。
 * 状态迁移全部用条件更新（WHERE status = ...）保证并发下不会重复推进。
 */
object SceneRunTable:

  private val TableLocation = "scene.scene_runs"

  private given RowDecoder[SceneRun] = RowDecoder { row =>
    SceneRun(
      id = SceneRunId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      requestedBy = UserId(row.getObject("requested_by", classOf[UUID])),
      status = RowDecoder.enumColumn(row, "status", TableLocation)(SceneRunStatus.fromString),
      source = RowDecoder.optionalEnumColumn(row, "source", TableLocation)(SceneSource.fromString),
      hint = optionalText(row, "hint"),
      photoIds = RowDecoder.jsonColumn[List[PhotoId]](row, "photo_ids", TableLocation),
      curationVersion = row.getInt("curation_version"),
      runtimeVersion = row.getString("runtime_version"),
      brief = RowDecoder.optionalJsonColumn[SceneBrief](row, "brief_json", TableLocation),
      code = optionalText(row, "code"),
      review = RowDecoder.optionalJsonColumn[SceneReview](row, "review_json", TableLocation),
      runtimeEvidence = RowDecoder.optionalJsonColumn[RuntimeEvidence](row, "runtime_json", TableLocation),
      attempts = row.getInt("attempts"),
      promptVersion = row.getString("prompt_version"),
      errorCode = optionalText(row, "error_code"),
      errorMessage = optionalText(row, "error_message"),
      createdAt = row.getTimestamp("created_at").toInstant,
      updatedAt = row.getTimestamp("updated_at").toInstant,
      restoredFrom = Option(row.getObject("restored_from", classOf[UUID])).map(SceneRunId.apply),
      buildRepairs = row.getInt("build_repairs"),
      kind = RowDecoder.enumColumn(row, "kind", TableLocation)(SceneRunKind.fromString),
      parentRunId = Option(row.getObject("parent_run_id", classOf[UUID])).map(SceneRunId.apply),
      revisionInstruction = optionalText(row, "revision_instruction"),
      dismissed = row.getBoolean("dismissed")
    )
  }

  private def optionalText(row: ResultSet, column: String): Option[String] = Option(row.getString(column))

  private val selectColumns =
    """SELECT id, exhibition_id, requested_by, status, source, hint, photo_ids, curation_version,
      |       runtime_version, brief_json, code, review_json, runtime_json, attempts, prompt_version,
      |       error_code, error_message, created_at, updated_at, restored_from, build_repairs,
      |       kind, parent_run_id, revision_instruction, dismissed
      |FROM scene.scene_runs""".stripMargin

  private val insertSql =
    """INSERT INTO scene.scene_runs
      |  (id, exhibition_id, requested_by, status, source, hint, photo_ids, curation_version,
      |   runtime_version, brief_json, code, review_json, runtime_json, attempts, prompt_version,
      |   error_code, error_message, created_at, updated_at, restored_from, build_repairs,
      |   kind, parent_run_id, revision_instruction, dismissed)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, run: SceneRun): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(run.id.value),
          SqlValue.Uuid(run.exhibitionId.value),
          SqlValue.Uuid(run.requestedBy.value),
          SqlValue.Text(SceneRunStatus.toString(run.status)),
          nullableText(run.source.map(SceneSource.toString)),
          nullableText(run.hint),
          SqlValue.JsonValue(run.photoIds.asJson.noSpaces),
          SqlValue.IntValue(run.curationVersion),
          SqlValue.Text(run.runtimeVersion),
          nullableJson(run.brief.map(_.asJson)),
          nullableText(run.code),
          nullableJson(run.review.map(_.asJson)),
          nullableJson(run.runtimeEvidence.map(_.asJson)),
          SqlValue.IntValue(run.attempts),
          SqlValue.Text(run.promptVersion),
          nullableText(run.errorCode),
          nullableText(run.errorMessage),
          SqlValue.InstantValue(run.createdAt),
          SqlValue.InstantValue(run.updatedAt),
          run.restoredFrom.fold(SqlValue.Null)(id => SqlValue.Uuid(id.value)),
          SqlValue.IntValue(run.buildRepairs),
          SqlValue.Text(SceneRunKind.toString(run.kind)),
          run.parentRunId.fold(SqlValue.Null)(id => SqlValue.Uuid(id.value)),
          nullableText(run.revisionInstruction),
          SqlValue.BooleanValue(run.dismissed)
        )
      )
      .void

  private val findByIdSql = s"$selectColumns WHERE id = ?"

  def findById(connection: Connection, id: SceneRunId): IO[Option[SceneRun]] =
    Sql.queryOne[SceneRun](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val findByIdForUpdateSql = s"$selectColumns WHERE id = ? FOR UPDATE"

  def findByIdForUpdate(connection: Connection, id: SceneRunId): IO[Option[SceneRun]] =
    Sql.queryOne[SceneRun](connection, findByIdForUpdateSql, List(SqlValue.Uuid(id.value)))

  private val dismissSql = "UPDATE scene.scene_runs SET dismissed = true WHERE id = ?"

  def dismiss(connection: Connection, id: SceneRunId): IO[Int] =
    Sql.update(connection, dismissSql, List(SqlValue.Uuid(id.value)))

  private val findLatestByExhibitionSql =
    s"$selectColumns WHERE exhibition_id = ? ORDER BY created_at DESC, id DESC LIMIT 1"

  /** 按展览读取最近运行；跨服务调用统一使用此公开名称（integration-points §4）。 */
  def findLatestByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[Option[SceneRun]] =
    Sql.queryOne[SceneRun](connection, findLatestByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val findLatestSucceededSql =
    s"$selectColumns WHERE exhibition_id = ? AND status = 'succeeded' ORDER BY created_at DESC, id DESC LIMIT 1"

  /** 最新一次 succeeded（source=ai/fallback 都算）。v1.14 起只用于一次性指针回填迁移与历史兼容，
   * 发布/详情/历史等读取点一律按 gallery.exhibitions.current_scene_run_id 指针。 */
  def findLatestSucceeded(connection: Connection, exhibitionId: ExhibitionId): IO[Option[SceneRun]] =
    Sql.queryOne[SceneRun](connection, findLatestSucceededSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val listByExhibitionSql =
    s"$selectColumns WHERE exhibition_id = ? ORDER BY created_at DESC, id DESC"

  /** 版本历史：该展览全部运行，最新在前。 */
  def listByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[List[SceneRun]] =
    Sql.query[SceneRun](connection, listByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val findActiveByExhibitionSql =
    s"""$selectColumns
       |WHERE exhibition_id = ? AND status IN ('queued', 'generating', 'awaiting_capture', 'reviewing')
       |ORDER BY created_at DESC, id DESC LIMIT 1""".stripMargin

  def findActiveByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[Option[SceneRun]] =
    Sql.queryOne[SceneRun](connection, findActiveByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val markGeneratingSql =
    "UPDATE scene.scene_runs SET status = 'generating', updated_at = ? WHERE id = ? AND status = 'queued'"

  def markGenerating(connection: Connection, id: SceneRunId, updatedAt: Instant): IO[Int] =
    Sql.update(connection, markGeneratingSql, List(SqlValue.InstantValue(updatedAt), SqlValue.Uuid(id.value)))

  private val saveBriefSql =
    """UPDATE scene.scene_runs
      |SET brief_json = ?, updated_at = ?
      |WHERE id = ? AND status = 'generating'""".stripMargin

  /** 父题面写完、代码还在生成时先落库，供前端区分"写题面 / 写代码"阶段。仅 generating 可写（取消后不回写）。 */
  def saveBrief(connection: Connection, id: SceneRunId, brief: SceneBrief, updatedAt: Instant): IO[Int] =
    Sql.update(
      connection,
      saveBriefSql,
      List(SqlValue.JsonValue(brief.asJson.noSpaces), SqlValue.InstantValue(updatedAt), SqlValue.Uuid(id.value))
    )

  private val markAwaitingCaptureSql =
    """UPDATE scene.scene_runs
      |SET status = 'awaiting_capture', source = ?, brief_json = ?, code = ?,
      |    error_code = NULL, error_message = NULL, updated_at = ?
      |WHERE id = ? AND status IN ('queued', 'generating')""".stripMargin

  def markAwaitingCapture(
    connection: Connection,
    id: SceneRunId,
    source: SceneSource,
    brief: SceneBrief,
    code: String,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      markAwaitingCaptureSql,
      List(
        SqlValue.Text(SceneSource.toString(source)),
        SqlValue.JsonValue(brief.asJson.noSpaces),
        SqlValue.Text(code),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value)
      )
    )

  private val claimForReviewSql =
    """UPDATE scene.scene_runs
      |SET status = 'reviewing', runtime_json = ?, updated_at = ?
      |WHERE id = ? AND requested_by = ? AND status = 'awaiting_capture'""".stripMargin

  /** reviewscene 的防双花入口：只有属主且状态恰为 awaiting_capture 时才能原子进入 reviewing。 */
  def claimForReview(
    connection: Connection,
    id: SceneRunId,
    requestedBy: UserId,
    runtimeEvidence: RuntimeEvidence,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      claimForReviewSql,
      List(
        SqlValue.JsonValue(runtimeEvidence.asJson.noSpaces),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value),
        SqlValue.Uuid(requestedBy.value)
      )
    )

  private val markSucceededForAiSql =
    """UPDATE scene.scene_runs
      |SET status = 'succeeded', source = 'ai', review_json = ?,
      |    error_code = NULL, error_message = NULL, updated_at = ?
      |WHERE id = ? AND status = 'reviewing'""".stripMargin

  /** 评审通过：保留生成代码与题面，写入评审结果。仅 reviewing 可推进（取消后不会误写成功）。 */
  def markSucceededForAi(
    connection: Connection,
    id: SceneRunId,
    review: SceneReview,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      markSucceededForAiSql,
      List(
        SqlValue.JsonValue(review.asJson.noSpaces),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value)
      )
    )

  private val markSucceededForFallbackSql =
    """UPDATE scene.scene_runs
      |SET status = 'succeeded', source = 'fallback', code = ?,
      |    review_json = COALESCE(CAST(? AS jsonb), review_json),
      |    error_code = NULL, error_message = NULL, updated_at = ?
      |WHERE id = ? AND status = 'reviewing'""".stripMargin

  /**
   * 修订用尽：写入兜底工件。spec §9.6 要求兜底保留最后一次评审结果，
   * 因此本次没有有效 review（None）时 **保留库中已有 review_json**，不覆盖为 null。
   * 仅 reviewing 可推进（取消后不会再写成功）。
   */
  def markSucceededForFallback(
    connection: Connection,
    id: SceneRunId,
    code: String,
    review: Option[SceneReview],
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      markSucceededForFallbackSql,
      List(
        SqlValue.Text(code),
        review.fold(SqlValue.Null)(value => SqlValue.JsonValue(value.asJson.noSpaces)),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value)
      )
    )

  private val markRevisingSql =
    """UPDATE scene.scene_runs
      |SET status = 'generating', attempts = attempts + 1, review_json = ?,
      |    error_code = NULL, error_message = NULL, updated_at = ?
      |WHERE id = ? AND status = 'reviewing'""".stripMargin

  /** 评审不通过且仍有修订额度：attempts+1 并回到 generating（随后由修复 fiber 重新生成）。 */
  def markRevising(
    connection: Connection,
    id: SceneRunId,
    review: SceneReview,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      markRevisingSql,
      List(
        SqlValue.JsonValue(review.asJson.noSpaces),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value)
      )
    )

  private val markBuildRepairingSql =
    """UPDATE scene.scene_runs
      |SET status = 'generating', build_repairs = build_repairs + 1, review_json = ?,
      |    error_code = NULL, error_message = NULL, updated_at = ?
      |WHERE id = ? AND status = 'reviewing'""".stripMargin

  /** 代码在构建阶段崩溃且仍有构建修复额度：buildRepairs+1 并回到 generating，attempts 不变。 */
  def markBuildRepairing(
    connection: Connection,
    id: SceneRunId,
    review: SceneReview,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      markBuildRepairingSql,
      List(
        SqlValue.JsonValue(review.asJson.noSpaces),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value)
      )
    )

  private val cancelNonTerminalSql =
    """UPDATE scene.scene_runs
      |SET status = 'cancelled', source = NULL, updated_at = ?
      |WHERE id = ? AND status IN ('queued', 'generating', 'awaiting_capture', 'reviewing')""".stripMargin

  /** 取消任意非终态运行（source 回到空：未成功的运行没有来源）；已完成/失败/取消返回 0。 */
  def cancelNonTerminal(connection: Connection, id: SceneRunId, updatedAt: Instant): IO[Int] =
    Sql.update(
      connection,
      cancelNonTerminalSql,
      List(SqlValue.InstantValue(updatedAt), SqlValue.Uuid(id.value))
    )

  private val markFailedSql =
    """UPDATE scene.scene_runs
      |SET status = 'failed', error_code = ?, error_message = ?, updated_at = ?
      |WHERE id = ? AND status IN ('queued', 'generating', 'awaiting_capture', 'reviewing')""".stripMargin

  def markFailed(
    connection: Connection,
    id: SceneRunId,
    errorCode: String,
    errorMessage: String,
    updatedAt: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      markFailedSql,
      List(
        SqlValue.Text(errorCode),
        SqlValue.Text(errorMessage),
        SqlValue.InstantValue(updatedAt),
        SqlValue.Uuid(id.value)
      )
    )

  private val recoverInterruptedRunsSql =
    """UPDATE scene.scene_runs
      |SET status = 'failed', error_code = 'SERVER_RESTARTED', error_message = ?, updated_at = ?
      |WHERE status IN ('queued', 'generating', 'awaiting_capture', 'reviewing')""".stripMargin

  /** 服务重启时清理上次进程遗留的活跃运行（spec 6.6：SERVER_RESTARTED）。 */
  def recoverInterruptedRuns(connection: Connection, updatedAt: Instant): IO[Int] =
    Sql.update(
      connection,
      recoverInterruptedRunsSql,
      List(SqlValue.Text("服务重启，运行已中断，请重新生成"), SqlValue.InstantValue(updatedAt))
    )

  private def nullableText(value: Option[String]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.Text.apply)

  private def nullableJson(value: Option[Json]): SqlValue =
    value.fold(SqlValue.Null)(json => SqlValue.JsonValue(json.noSpaces))
