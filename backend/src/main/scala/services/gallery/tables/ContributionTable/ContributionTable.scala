package services.gallery.tables

import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.*
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** gallery.contributions：投稿行（一稿 = 回忆 + 可选照片 + 位置建议 + 版本/状态）。
  * 配额与列表查询都留在表内；业务判定（权限、采用、状态迁移）在 API 消息或 utils。
  * 阶段 2.5 起图片列可空：纯文字投稿的图片列为 NULL，照片配额只统计有照片的投稿。 */
object ContributionTable:
  private val TableLocation = "gallery.contributions"

  private given RowDecoder[Contribution] = RowDecoder { row =>
    Contribution(
      id = ContributionId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      contributorId = UserId(row.getObject("contributor_id", classOf[UUID])),
      status = RowDecoder.enumColumn(row, "status", TableLocation)(ContributionStatus.fromString),
      version = row.getInt("version"),
      memoryText = row.getString("memory_text"),
      suggestedCaption = optionalText(row, "suggested_caption"),
      originalName = optionalText(row, "original_name"),
      mime = optionalText(row, "mime"),
      width = optionalInt(row, "width"),
      height = optionalInt(row, "height"),
      originalKey = optionalText(row, "original_key"),
      thumbKey = optionalText(row, "thumb_key"),
      displayKey = optionalText(row, "display_key"),
      originalBytes = optionalLong(row, "original_bytes"),
      derivedBytes = optionalLong(row, "derived_bytes"),
      locationName = row.getString("location_name"),
      latitude = optionalDouble(row, "latitude"),
      longitude = optionalDouble(row, "longitude"),
      locationSource = RowDecoder.enumColumn(row, "location_source", TableLocation)(LocationSource.fromString),
      createdAt = row.getTimestamp("created_at").toInstant,
      updatedAt = row.getTimestamp("updated_at").toInstant,
      withdrawnAt = Option(row.getTimestamp("withdrawn_at")).map(_.toInstant),
      declinedAt = Option(row.getTimestamp("declined_at")).map(_.toInstant)
    )
  }

  private val selectColumns =
    """SELECT id, exhibition_id, contributor_id, status, version, memory_text, suggested_caption,
      |       original_name, mime, width, height, original_key, thumb_key, display_key,
      |       original_bytes, derived_bytes, location_name, latitude, longitude, location_source,
      |       created_at, updated_at, withdrawn_at, declined_at
      |FROM gallery.contributions""".stripMargin

  private val insertSql =
    """INSERT INTO gallery.contributions
      |  (id, exhibition_id, contributor_id, status, version, memory_text, suggested_caption,
      |   original_name, mime, width, height, original_key, thumb_key, display_key,
      |   original_bytes, derived_bytes, location_name, latitude, longitude, location_source,
      |   created_at, updated_at, withdrawn_at, declined_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, contribution: Contribution): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(contribution.id.value),
          SqlValue.Uuid(contribution.exhibitionId.value),
          SqlValue.Uuid(contribution.contributorId.value),
          SqlValue.Text(ContributionStatus.toString(contribution.status)),
          SqlValue.IntValue(contribution.version),
          SqlValue.Text(contribution.memoryText),
          nullableText(contribution.suggestedCaption),
          nullableText(contribution.originalName),
          nullableText(contribution.mime),
          nullableInt(contribution.width),
          nullableInt(contribution.height),
          nullableText(contribution.originalKey),
          nullableText(contribution.thumbKey),
          nullableText(contribution.displayKey),
          nullableLong(contribution.originalBytes),
          nullableLong(contribution.derivedBytes),
          SqlValue.Text(contribution.locationName),
          nullableDouble(contribution.latitude),
          nullableDouble(contribution.longitude),
          SqlValue.Text(LocationSource.toString(contribution.locationSource)),
          SqlValue.InstantValue(contribution.createdAt),
          SqlValue.InstantValue(contribution.updatedAt),
          contribution.withdrawnAt.fold(SqlValue.Null)(SqlValue.InstantValue.apply),
          contribution.declinedAt.fold(SqlValue.Null)(SqlValue.InstantValue.apply)
        )
      )
      .void

  private val findByIdSql = s"$selectColumns WHERE id = ?"

  def findById(connection: Connection, id: ContributionId): IO[Option[Contribution]] =
    Sql.queryOne[Contribution](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val listByContributorSql =
    s"$selectColumns WHERE contributor_id = ? AND (?::uuid IS NULL OR exhibition_id = ?) ORDER BY updated_at DESC, id"

  /** 投稿者自己的投稿：可跨展览或按展览过滤；包含 draft/submitted/declined/withdrawn。 */
  def listByContributor(connection: Connection, contributorId: UserId, exhibitionId: Option[ExhibitionId]): IO[List[Contribution]] =
    val scoped = exhibitionId.fold(SqlValue.Null)(id => SqlValue.Uuid(id.value))
    Sql.query[Contribution](connection, listByContributorSql, List(SqlValue.Uuid(contributorId.value), scoped, scoped))

  private val listForExhibitionReviewSql =
    s"""$selectColumns
       |WHERE exhibition_id = ? AND status IN ('submitted', 'declined', 'withdrawn')
       |ORDER BY updated_at DESC, id""".stripMargin

  /** 创建者审阅列表：submitted/declined/withdrawn（不含 draft）。 */
  def listForExhibitionReview(connection: Connection, exhibitionId: ExhibitionId): IO[List[Contribution]] =
    Sql.query[Contribution](connection, listForExhibitionReviewSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val visibleStatusesSql = "status IN ('submitted', 'declined', 'withdrawn')"

  private val countVisibleByContributorSql =
    s"SELECT count(*) FROM gallery.contributions WHERE exhibition_id = ? AND contributor_id = ? AND $visibleStatusesSql"

  def countVisibleByContributor(
    connection: Connection,
    exhibitionId: ExhibitionId,
    contributorId: UserId
  ): IO[Int] =
    Sql
      .queryOne[Int](
        connection,
        countVisibleByContributorSql,
        List(SqlValue.Uuid(exhibitionId.value), SqlValue.Uuid(contributorId.value))
      )
      .map(_.getOrElse(0))

  private given RowDecoder[(UserId, Int)] = RowDecoder { row =>
    (UserId(row.getObject(1, classOf[UUID])), row.getInt(2))
  }

  private val countVisibleGroupedSql =
    s"""SELECT contributor_id, count(*) FROM gallery.contributions
       |WHERE exhibition_id = ? AND $visibleStatusesSql
       |GROUP BY contributor_id""".stripMargin

  /** 创作者的参与者列表：一次取各参与者的可见投稿数。 */
  def countVisibleGroupedByContributor(connection: Connection, exhibitionId: ExhibitionId): IO[Map[UserId, Int]] =
    Sql
      .query[(UserId, Int)](connection, countVisibleGroupedSql, List(SqlValue.Uuid(exhibitionId.value)))
      .map(_.toMap)

  private given RowDecoder[(ExhibitionId, Int)] = RowDecoder { row =>
    (ExhibitionId(row.getObject(1, classOf[UUID])), row.getInt(2))
  }

  // 待创建者处理 = submitted 且（尚未采用，或投稿版本高于已采用版本）；与工作台「待审回忆」口径一致。
  private val countPendingReviewByExhibitionsSql =
    """SELECT c.exhibition_id, count(*)
      |FROM gallery.contributions c
      |LEFT JOIN gallery.photo_memories m ON m.contribution_id = c.id
      |WHERE c.exhibition_id = ANY(?::uuid[]) AND c.status = 'submitted'
      |  AND (m.id IS NULL OR c.version > m.adopted_version)
      |GROUP BY c.exhibition_id""".stripMargin

  /** 一次取多个展览待处理的投稿数（我的展览列表 / 工作台徽标共用）；没有待处理投稿的展览不出现在结果里。 */
  def countPendingReviewByExhibitions(
    connection: Connection,
    exhibitionIds: List[ExhibitionId]
  ): IO[Map[ExhibitionId, Int]] =
    if exhibitionIds.isEmpty then IO.pure(Map.empty)
    else
      val arrayLiteral = exhibitionIds.map(_.value.toString).mkString("{", ",", "}")
      Sql
        .query[(ExhibitionId, Int)](connection, countPendingReviewByExhibitionsSql, List(SqlValue.Text(arrayLiteral)))
        .map(_.toMap)

  private val updateContentSql =
    """UPDATE gallery.contributions
      |SET memory_text = ?, suggested_caption = ?, location_name = ?, latitude = ?, longitude = ?,
      |    location_source = ?, status = ?, version = ?, updated_at = ?
      |WHERE id = ? AND contributor_id = ? AND version = ? AND status IN ('draft', 'submitted', 'declined')""".stripMargin

  /** 保存回忆/建议图注/位置/状态：版本号由调用方按“内容是否变化”计算，条件更新防并发覆盖（0 行 = 版本冲突）。 */
  def updateContent(
    connection: Connection,
    id: ContributionId,
    contributorId: UserId,
    expectedVersion: Int,
    newVersion: Int,
    newStatus: ContributionStatus,
    memoryText: String,
    suggestedCaption: Option[String],
    locationName: String,
    latitude: Option[Double],
    longitude: Option[Double],
    locationSource: LocationSource,
    now: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      updateContentSql,
      List(
        SqlValue.Text(memoryText),
        nullableText(suggestedCaption),
        SqlValue.Text(locationName),
        nullableDouble(latitude),
        nullableDouble(longitude),
        SqlValue.Text(LocationSource.toString(locationSource)),
        SqlValue.Text(ContributionStatus.toString(newStatus)),
        SqlValue.IntValue(newVersion),
        SqlValue.InstantValue(now),
        SqlValue.Uuid(id.value),
        SqlValue.Uuid(contributorId.value),
        SqlValue.IntValue(expectedVersion)
      )
    )

  private val clearPhotoSql =
    """UPDATE gallery.contributions
      |SET original_name = NULL, mime = NULL, width = NULL, height = NULL,
      |    original_key = NULL, thumb_key = NULL, display_key = NULL,
      |    original_bytes = NULL, derived_bytes = NULL,
      |    status = ?, version = ?, updated_at = ?
      |WHERE id = ? AND contributor_id = ? AND version = ? AND original_key IS NOT NULL
      |  AND status IN ('draft', 'submitted', 'declined')""".stripMargin

  /** 移除投稿照片（保留回忆）：清空图片列；版本号由调用方计算。 */
  def clearPhoto(
    connection: Connection,
    id: ContributionId,
    contributorId: UserId,
    expectedVersion: Int,
    newVersion: Int,
    newStatus: ContributionStatus,
    now: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      clearPhotoSql,
      List(
        SqlValue.Text(ContributionStatus.toString(newStatus)),
        SqlValue.IntValue(newVersion),
        SqlValue.InstantValue(now),
        SqlValue.Uuid(id.value),
        SqlValue.Uuid(contributorId.value),
        SqlValue.IntValue(expectedVersion)
      )
    )

  private val updateFileSql =
    """UPDATE gallery.contributions
      |SET original_name = ?, mime = ?, width = ?, height = ?, original_key = ?, thumb_key = ?, display_key = ?,
      |    original_bytes = ?, derived_bytes = ?, version = ?, updated_at = ?
      |WHERE id = ? AND contributor_id = ? AND version = ? AND status <> 'withdrawn'""".stripMargin

  /** 附加/替换投稿照片（单文件）：状态保持不变（draft/submitted/declined），版本 +1。 */
  def updateFile(
    connection: Connection,
    id: ContributionId,
    contributorId: UserId,
    expectedVersion: Int,
    originalName: String,
    mime: String,
    width: Option[Int],
    height: Option[Int],
    originalKey: String,
    thumbKey: String,
    displayKey: String,
    originalBytes: Long,
    derivedBytes: Long,
    now: Instant
  ): IO[Int] =
    Sql.update(
      connection,
      updateFileSql,
      List(
        SqlValue.Text(originalName),
        SqlValue.Text(mime),
        nullableInt(width),
        nullableInt(height),
        SqlValue.Text(originalKey),
        SqlValue.Text(thumbKey),
        SqlValue.Text(displayKey),
        SqlValue.LongValue(originalBytes),
        SqlValue.LongValue(derivedBytes),
        SqlValue.IntValue(expectedVersion + 1),
        SqlValue.InstantValue(now),
        SqlValue.Uuid(id.value),
        SqlValue.Uuid(contributorId.value),
        SqlValue.IntValue(expectedVersion)
      )
    )

  private val declineSql =
    """UPDATE gallery.contributions
      |SET status = 'declined', declined_at = ?, updated_at = ?
      |WHERE id = ? AND version = ? AND status = 'submitted'""".stripMargin

  /** 策展人不采用：仅 submitted 且版本一致；version 不变。 */
  def decline(connection: Connection, id: ContributionId, expectedVersion: Int, now: Instant): IO[Int] =
    Sql.update(
      connection,
      declineSql,
      List(SqlValue.InstantValue(now), SqlValue.InstantValue(now), SqlValue.Uuid(id.value), SqlValue.IntValue(expectedVersion))
    )

  private val withdrawSql =
    """UPDATE gallery.contributions
      |SET status = 'withdrawn', withdrawn_at = ?, updated_at = ?
      |WHERE id = ? AND contributor_id = ? AND status IN ('draft', 'submitted', 'declined')""".stripMargin

  def withdraw(connection: Connection, id: ContributionId, contributorId: UserId, now: Instant): IO[Int] =
    Sql.update(
      connection,
      withdrawSql,
      List(SqlValue.InstantValue(now), SqlValue.InstantValue(now), SqlValue.Uuid(id.value), SqlValue.Uuid(contributorId.value))
    )

  private val quotaByContributorSql =
    """SELECT count(*), coalesce(sum(original_bytes + derived_bytes), 0)
      |FROM gallery.contributions
      |WHERE contributor_id = ? AND exhibition_id = ? AND original_key IS NOT NULL""".stripMargin

  /** 每人每展览照片配额（含已撤回但文件未清理的照片投稿）；纯文字投稿不占配额。 */
  def quotaByContributor(connection: Connection, contributorId: UserId, exhibitionId: ExhibitionId): IO[(Int, Long)] =
    Sql
      .query[(Int, Long)](
        connection,
        quotaByContributorSql,
        List(SqlValue.Uuid(contributorId.value), SqlValue.Uuid(exhibitionId.value))
      )
      .map(_.headOption.getOrElse((0, 0L)))

  private val quotaByExhibitionSql =
    """SELECT count(*), coalesce(sum(original_bytes + derived_bytes), 0)
      |FROM gallery.contributions
      |WHERE exhibition_id = ? AND original_key IS NOT NULL""".stripMargin

  /** 每展览照片配额（含已撤回但文件未清理的照片投稿）；纯文字投稿不占配额。 */
  def quotaByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[(Int, Long)] =
    Sql
      .query[(Int, Long)](connection, quotaByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))
      .map(_.headOption.getOrElse((0, 0L)))

  private given RowDecoder[(Int, Long)] = RowDecoder(row => (row.getInt(1), row.getLong(2)))

  private def optionalText(row: ResultSet, column: String): Option[String] =
    Option(row.getString(column))

  private def optionalInt(row: ResultSet, column: String): Option[Int] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.intValue }

  private def optionalLong(row: ResultSet, column: String): Option[Long] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.longValue }

  private def optionalDouble(row: ResultSet, column: String): Option[Double] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.doubleValue }

  private def nullableText(value: Option[String]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.Text.apply)

  private def nullableInt(value: Option[Int]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.IntValue.apply)

  private def nullableLong(value: Option[Long]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.LongValue.apply)

  private def nullableDouble(value: Option[Double]): SqlValue =
    value.fold(SqlValue.Null)(SqlValue.DoubleValue.apply)
