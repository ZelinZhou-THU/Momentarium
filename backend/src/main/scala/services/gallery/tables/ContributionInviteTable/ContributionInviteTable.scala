package services.gallery.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.*
import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.UserId

/** gallery.contribution_invites：邀请链接（DB 只存令牌哈希）；关闭只阻止新加入，不撤销已有参与者。 */
object ContributionInviteTable:
  private val TableLocation = "gallery.contribution_invites"

  private given RowDecoder[ContributionInvite] = RowDecoder { row =>
    ContributionInvite(
      id = ContributionInviteId(row.getObject("id", classOf[UUID])),
      exhibitionId = ExhibitionId(row.getObject("exhibition_id", classOf[UUID])),
      tokenHash = row.getString("token_hash"),
      status = RowDecoder.enumColumn(row, "status", TableLocation)(ContributionInviteStatus.fromString),
      createdBy = UserId(row.getObject("created_by", classOf[UUID])),
      createdAt = row.getTimestamp("created_at").toInstant,
      closedAt = Option(row.getTimestamp("closed_at")).map(_.toInstant)
    )
  }

  private val selectColumns =
    """SELECT id, exhibition_id, token_hash, status, created_by, created_at, closed_at
      |FROM gallery.contribution_invites""".stripMargin

  private val insertSql =
    """INSERT INTO gallery.contribution_invites
      |  (id, exhibition_id, token_hash, status, created_by, created_at, closed_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, invite: ContributionInvite): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(invite.id.value),
          SqlValue.Uuid(invite.exhibitionId.value),
          SqlValue.Text(invite.tokenHash),
          SqlValue.Text(ContributionInviteStatus.toString(invite.status)),
          SqlValue.Uuid(invite.createdBy.value),
          SqlValue.InstantValue(invite.createdAt),
          invite.closedAt.fold(SqlValue.Null)(SqlValue.InstantValue.apply)
        )
      )
      .void

  private val findByIdSql = s"$selectColumns WHERE id = ? AND exhibition_id = ?"

  def findById(connection: Connection, exhibitionId: ExhibitionId, inviteId: ContributionInviteId): IO[Option[ContributionInvite]] =
    Sql.queryOne[ContributionInvite](
      connection,
      findByIdSql,
      List(SqlValue.Uuid(inviteId.value), SqlValue.Uuid(exhibitionId.value))
    )

  private val findByTokenHashSql = s"$selectColumns WHERE token_hash = ?"

  /** 邀请预览/兑换加入凭明文令牌哈希查找；无效令牌统一按不存在处理。 */
  def findByTokenHash(connection: Connection, tokenHash: String): IO[Option[ContributionInvite]] =
    Sql.queryOne[ContributionInvite](connection, findByTokenHashSql, List(SqlValue.Text(tokenHash)))

  private val listByExhibitionSql = s"$selectColumns WHERE exhibition_id = ? ORDER BY created_at DESC, id"

  def listByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[List[ContributionInvite]] =
    Sql.query[ContributionInvite](connection, listByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val closeSql =
    """UPDATE gallery.contribution_invites
      |SET status = 'closed', closed_at = COALESCE(closed_at, ?)
      |WHERE id = ? AND exhibition_id = ?""".stripMargin

  def close(connection: Connection, exhibitionId: ExhibitionId, inviteId: ContributionInviteId, closedAt: java.time.Instant): IO[Int] =
    Sql.update(
      connection,
      closeSql,
      List(SqlValue.InstantValue(closedAt), SqlValue.Uuid(inviteId.value), SqlValue.Uuid(exhibitionId.value))
    )
