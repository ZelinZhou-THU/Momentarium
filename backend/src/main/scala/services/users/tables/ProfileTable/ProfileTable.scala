package services.users.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.system.db.{RowDecoder, Sql, SqlValue}
import services.users.objects.{Profile, UserId}

/** users.profiles 的公开表方法（返回 IO[T]，不含业务逻辑）；gallery 的作者主页与公开页会跨服务读取。 */
object ProfileTable:
  private given RowDecoder[Profile] = RowDecoder { row =>
    Profile(
      userId = UserId(row.getObject("user_id", classOf[UUID])),
      displayName = row.getString("display_name"),
      bio = row.getString("bio"),
      homepagePublic = row.getBoolean("homepage_public"),
      updatedAt = row.getTimestamp("updated_at").toInstant
    )
  }

  private val findByUserIdSql =
    "SELECT user_id, display_name, bio, homepage_public, updated_at FROM users.profiles WHERE user_id = ?"

  def findByUserId(connection: Connection, userId: UserId): IO[Option[Profile]] =
    Sql.queryOne[Profile](connection, findByUserIdSql, List(SqlValue.Uuid(userId.value)))

  private val upsertSql =
    """INSERT INTO users.profiles (user_id, display_name, bio, homepage_public, updated_at)
      |VALUES (?, ?, ?, ?, ?)
      |ON CONFLICT (user_id) DO UPDATE SET
      |  display_name = EXCLUDED.display_name,
      |  bio = EXCLUDED.bio,
      |  homepage_public = EXCLUDED.homepage_public,
      |  updated_at = EXCLUDED.updated_at""".stripMargin

  def upsert(connection: Connection, profile: Profile): IO[Unit] =
    Sql
      .update(
        connection,
        upsertSql,
        List(
          SqlValue.Uuid(profile.userId.value),
          SqlValue.Text(profile.displayName),
          SqlValue.Text(profile.bio),
          SqlValue.BooleanValue(profile.homepagePublic),
          SqlValue.InstantValue(profile.updatedAt)
        )
      )
      .void
