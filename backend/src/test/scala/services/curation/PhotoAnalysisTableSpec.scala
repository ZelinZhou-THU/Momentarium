package services.curation

import java.nio.file.Path
import java.sql.Connection
import java.time.Instant
import java.util.UUID

import cats.effect.IO

import munit.CatsEffectSuite

import services.curation.objects.{ChatSessionId, PhotoAnalysis, PhotoAnalysisRecord}
import services.curation.tables.{ChatMessageTable, ChatMessageTableInitializer, ChatSessionTableInitializer, PhotoAnalysisTable, PhotoAnalysisTableInitializer}
import services.gallery.objects.PhotoId
import services.system.config.{DatabaseConfig, DotEnv}
import services.system.db.{Database, Sql, SqlValue}

/**
 * PhotoAnalysisTable 的真实读写测试：跑在 AI 开发库 `momentarium_ai`（integration-points §1），
 * 不触碰平台库 `momentarium_platform`。测试自己建表、用随机 photoId，结束后清理本次写入的行。
 */
class PhotoAnalysisTableSpec extends CatsEffectSuite:

  private val analysis = PhotoAnalysis(
    description = "傍晚的礁石被浪反复打湿",
    mood = "安静的眷恋",
    palette = List("#1B2A4A", "#F2A65A", "#2E2B33"),
    memoryCues = List("退潮后礁石上的盐光"),
    sensory = "咸湿海风与浪声",
    suggestedCaption = "浪把黄昏揉碎在黑石上"
  )

  test("PhotoAnalysisTable 在 momentarium_ai 上 upsert / findById / findByIds 往返一致") {
    databaseConfig.flatMap { config =>
      Database.resource(config).use { database =>
        database.use { connection =>
          for
            _ <- PhotoAnalysisTableInitializer.initialize(connection)
            first <- IO.randomUUID.map(PhotoId.apply)
            second <- IO.randomUUID.map(PhotoId.apply)
            missing <- IO.randomUUID.map(PhotoId.apply)
            firstRecord = PhotoAnalysisRecord(first, analysis, "deepseek-v4.1-flash", Instant.parse("2026-10-27T12:00:00Z"))
            secondRecord = PhotoAnalysisRecord(
              second,
              analysis.copy(mood = "温暖的室内午后"),
              "deepseek-v4.1-flash",
              Instant.parse("2026-10-27T12:01:00Z")
            )
            _ <- PhotoAnalysisTable.upsert(connection, firstRecord)
            _ <- PhotoAnalysisTable.upsert(connection, secondRecord)
            foundFirst <- PhotoAnalysisTable.findById(connection, first)
            foundMissing <- PhotoAnalysisTable.findById(connection, missing)
            batch <- PhotoAnalysisTable.findByIds(connection, List(first, second, missing))
            emptyBatch <- PhotoAnalysisTable.findByIds(connection, Nil)
            refreshed = firstRecord.copy(
              analysis = analysis.copy(mood = "更新后的情绪"),
              analyzedAt = Instant.parse("2026-10-27T12:02:00Z")
            )
            _ <- PhotoAnalysisTable.upsert(connection, refreshed)
            afterUpsert <- PhotoAnalysisTable.findById(connection, first)
            _ <- cleanup(connection, List(first, second))
          yield
            assertEquals(foundFirst, Some(firstRecord))
            assertEquals(foundMissing, None)
            assertEquals(batch.map(_.photoId).toSet, Set(first, second))
            assertEquals(emptyBatch, Nil)
            assertEquals(afterUpsert, Some(refreshed))
        }
      }
    }
  }

  test("PhotoAnalysisTable 的 palette 结构不匹配解码失败而不是静默吞掉") {
    databaseConfig.flatMap { config =>
      Database.resource(config).use { database =>
        database.use { connection =>
          for
            _ <- PhotoAnalysisTableInitializer.initialize(connection)
            photoId <- IO.randomUUID.map(PhotoId.apply)
            _ <- PhotoAnalysisTable.upsert(
                    connection,
                    PhotoAnalysisRecord(photoId, analysis, "deepseek-v4.1-flash", Instant.parse("2026-10-27T12:00:00Z"))
                  )
            corrupted <- Sql.update(
                           connection,
                           "UPDATE curation.photo_analyses SET palette = '{\"a\":1}'::jsonb WHERE photo_id = ?",
                           List(SqlValue.Uuid(photoId.value))
                         )
            outcome <- PhotoAnalysisTable.findById(connection, photoId).attempt
            _ <- cleanup(connection, List(photoId))
          yield
            assertEquals(corrupted, 1)
            outcome match
              case Left(error: IllegalStateException) =>
                assert(error.getMessage.contains("curation.photo_analyses.palette"))
              case other => fail(s"损坏 palette 应触发解码失败，实际: $other")
        }
      }
    }
  }

  test("ChatMessageTable 的非法 role 存储值解码失败而不是静默变 assistant") {
    databaseConfig.flatMap { config =>
      Database.resource(config).use { database =>
        database.use { connection =>
          val sessionId = ChatSessionId(UUID.randomUUID())
          for
            _ <- ChatSessionTableInitializer.initialize(connection)
            _ <- ChatMessageTableInitializer.initialize(connection)
            _ <- Sql.update(
                   connection,
                   "INSERT INTO curation.chat_sessions (id, exhibition_id, user_id, created_at) VALUES (?, ?, ?, ?)",
                   List(
                     SqlValue.Uuid(sessionId.value),
                     SqlValue.Uuid(UUID.randomUUID()),
                     SqlValue.Uuid(UUID.randomUUID()),
                     SqlValue.InstantValue(Instant.parse("2026-10-27T12:00:00Z"))
                   )
                 )
            _ <- Sql.update(
                   connection,
                   "INSERT INTO curation.chat_messages (id, session_id, role, content, created_at) VALUES (?, ?, 'bogus', ?, ?)",
                   List(
                     SqlValue.Uuid(UUID.randomUUID()),
                     SqlValue.Uuid(sessionId.value),
                     SqlValue.Text("损坏的存储值"),
                     SqlValue.InstantValue(Instant.parse("2026-10-27T12:00:01Z"))
                   )
                 )
            outcome <- ChatMessageTable.listBySession(connection, sessionId).attempt
            _ <- Sql.update(
                   connection,
                   "DELETE FROM curation.chat_sessions WHERE id = ?",
                   List(SqlValue.Uuid(sessionId.value))
                 )
          yield outcome match
            case Left(error: IllegalStateException) =>
              assert(error.getMessage.contains("curation.chat_messages.role"))
            case other => fail(s"非法 role 应触发解码失败，实际: $other")
        }
      }
    }
  }

  /** 数据库连接参数与 .env 共用（不打印凭据），只把库名固定为 AI 开发库。 */
  private def databaseConfig: IO[DatabaseConfig] = DotEnv.load(Path.of(".env")).flatMap { dotEnv =>
      val databaseUrl = sys.env.getOrElse("TEST_AI_DB_URL", "jdbc:postgresql://localhost:5432/momentarium_ai")
      DatabaseConfig.fromEnvironment(dotEnv ++ sys.env + ("DB_URL" -> databaseUrl)) match
        case Right(config) => IO.pure(config)
        case Left(error) => IO.raiseError(new IllegalStateException(s"测试数据库配置无效：$error"))
    }

  private def cleanup(connection: Connection, photoIds: List[PhotoId]): IO[Unit] =
    Sql
      .update(
        connection,
        "DELETE FROM curation.photo_analyses WHERE photo_id = ANY(?::uuid[])",
        List(SqlValue.Text(photoIds.map(id => id.value.toString).mkString("{", ",", "}")))
      )
      .void
