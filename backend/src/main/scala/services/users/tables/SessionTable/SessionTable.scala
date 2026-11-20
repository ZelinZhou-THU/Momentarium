package services.users.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.{Session, UserId}

/** users.sessions：令牌哈希与归属用户；原始令牌不落库。 */
object SessionTable:
  private given RowDecoder[Session] = RowDecoder { row =>
    Session(
      tokenHash = row.getString("token_hash"),
      userId = UserId(row.getObject("user_id", classOf[UUID])),
      createdAt = row.getTimestamp("created_at").toInstant,
      expiresAt = row.getTimestamp("expires_at").toInstant
    )
  }

  private val findByTokenHashSql =
    "SELECT token_hash, user_id, created_at, expires_at FROM users.sessions WHERE token_hash = ?"

  def findByTokenHash(connection: Connection, tokenHash: String): IO[Option[Session]] =
    Sql.queryOne[Session](connection, findByTokenHashSql, List(SqlValue.Text(tokenHash)))

  private val insertSql =
    "INSERT INTO users.sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)"

  def insert(connection: Connection, session: Session): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Text(session.tokenHash),
          SqlValue.Uuid(session.userId.value),
          SqlValue.InstantValue(session.createdAt),
          SqlValue.InstantValue(session.expiresAt)
        )
      )
      .void

  private val deleteByTokenHashSql = "DELETE FROM users.sessions WHERE token_hash = ?"

  def deleteByTokenHash(connection: Connection, tokenHash: String): IO[Unit] =
    Sql.update(connection, deleteByTokenHashSql, List(SqlValue.Text(tokenHash))).void

  private val deleteByUserIdSql = "DELETE FROM users.sessions WHERE user_id = ?"

  def deleteByUserId(connection: Connection, userId: UserId): IO[Unit] =
    Sql.update(connection, deleteByUserIdSql, List(SqlValue.Uuid(userId.value))).void
