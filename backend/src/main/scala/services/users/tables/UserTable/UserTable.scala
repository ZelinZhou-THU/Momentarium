package services.users.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.{User, UserId}

/** users.users：账户行；密码以 BCrypt 哈希保存。 */
object UserTable:
  private given RowDecoder[User] = RowDecoder { row =>
    User(
      id = UserId(row.getObject("id", classOf[UUID])),
      username = row.getString("username"),
      passwordHash = row.getString("password_hash"),
      createdAt = row.getTimestamp("created_at").toInstant
    )
  }

  private val findByIdSql = "SELECT id, username, password_hash, created_at FROM users.users WHERE id = ?"

  def findById(connection: Connection, id: UserId): IO[Option[User]] =
    Sql.queryOne[User](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val findByUsernameSql = "SELECT id, username, password_hash, created_at FROM users.users WHERE username = ?"

  def findByUsername(connection: Connection, username: String): IO[Option[User]] =
    Sql.queryOne[User](connection, findByUsernameSql, List(SqlValue.Text(username)))

  private val insertSql = "INSERT INTO users.users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)"

  def insert(connection: Connection, user: User): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(user.id.value),
          SqlValue.Text(user.username),
          SqlValue.Text(user.passwordHash),
          SqlValue.InstantValue(user.createdAt)
        )
      )
      .void

  private val updatePasswordHashSql = "UPDATE users.users SET password_hash = ? WHERE id = ?"

  def updatePasswordHash(connection: Connection, id: UserId, passwordHash: String): IO[Unit] =
    Sql.update(connection, updatePasswordHashSql, List(SqlValue.Text(passwordHash), SqlValue.Uuid(id.value))).void
