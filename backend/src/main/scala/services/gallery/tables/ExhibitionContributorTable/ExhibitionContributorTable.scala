package services.gallery.tables

import java.sql.Connection
import java.time.Instant
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.*
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** gallery.exhibition_contributors：参与关系（展览, 用户），撤销为终态；加入幂等。 */
object ExhibitionContributorTable:
  private val TableLocation = "gallery.exhibition_contributors"

  private given RowDecoder[ExhibitionContributor] = RowDecoder { row =>
    ExhibitionContributor(
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      userId = UserId(row.getObject("user_id", classOf[UUID])),
      inviteId = Option(row.getObject("invite_id", classOf[UUID])).map(ContributionInviteId.apply),
      status = RowDecoder.enumColumn(row, "status", TableLocation)(ContributorStatus.fromString),
      joinedAt = row.getTimestamp("joined_at").toInstant,
      revokedAt = Option(row.getTimestamp("revoked_at")).map(_.toInstant),
      updatedAt = row.getTimestamp("updated_at").toInstant
    )
  }

  private val selectColumns =
    """SELECT exhibition_id, user_id, invite_id, status, joined_at, revoked_at, updated_at
      |FROM gallery.exhibition_contributors""".stripMargin

  private val findSql = s"$selectColumns WHERE exhibition_id = ? AND user_id = ?"

  def find(connection: Connection, exhibitionId: ExhibitionId, userId: UserId): IO[Option[ExhibitionContributor]] =
    Sql.queryOne[ExhibitionContributor](
      connection,
      findSql,
      List(SqlValue.Uuid(exhibitionId.value), SqlValue.Uuid(userId.value))
    )

  private val listByExhibitionSql = s"$selectColumns WHERE exhibition_id = ? ORDER BY joined_at, user_id"

  def listByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[List[ExhibitionContributor]] =
    Sql.query[ExhibitionContributor](connection, listByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val insertSql =
    """INSERT INTO gallery.exhibition_contributors
      |  (exhibition_id, user_id, invite_id, status, joined_at, revoked_at, updated_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?)
      |ON CONFLICT (exhibition_id, user_id) DO NOTHING""".stripMargin

  /** 加入幂等：并发重复兑换由主键冲突吞掉；调用方通过 find 区分 active / revoked。 */
  def insertIfAbsent(connection: Connection, contributor: ExhibitionContributor): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(contributor.exhibitionId.value),
          SqlValue.Uuid(contributor.userId.value),
          contributor.inviteId.fold(SqlValue.Null)(inviteId => SqlValue.Uuid(inviteId.value)),
          SqlValue.Text(ContributorStatus.toString(contributor.status)),
          SqlValue.InstantValue(contributor.joinedAt),
          contributor.revokedAt.fold(SqlValue.Null)(SqlValue.InstantValue.apply),
          SqlValue.InstantValue(contributor.updatedAt)
        )
      )
      .void

  private val revokeSql =
    """UPDATE gallery.exhibition_contributors
      |SET status = 'revoked', revoked_at = ?, updated_at = ?
      |WHERE exhibition_id = ? AND user_id = ? AND status = 'active'""".stripMargin

  def revoke(connection: Connection, exhibitionId: ExhibitionId, userId: UserId, now: Instant): IO[Int] =
    Sql.update(
      connection,
      revokeSql,
      List(SqlValue.InstantValue(now), SqlValue.InstantValue(now), SqlValue.Uuid(exhibitionId.value), SqlValue.Uuid(userId.value))
    )
