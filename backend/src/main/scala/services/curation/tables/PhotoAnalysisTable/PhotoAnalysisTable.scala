package services.curation.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO
import io.circe.syntax.*

import services.curation.objects.{PhotoAnalysis, PhotoAnalysisRecord}
import services.gallery.objects.PhotoId
import services.system.db.{RowDecoder, Sql, SqlValue}

/**
 * curation.photo_analyses 的公开表方法（返回 IO[T]，不含业务逻辑）。
 *
 * 读方法返回 [[PhotoAnalysisRecord]] 而不是裸 [[PhotoAnalysis]]：跨服务（scene）按 photoIds
 * 取分析结果时必须能通过 photoId 对齐，否则无法把分析放回对应的照片。
 */
object PhotoAnalysisTable:

  private val TableLocation = "curation.photo_analyses"

  private given RowDecoder[PhotoAnalysisRecord] = RowDecoder { row =>
    PhotoAnalysisRecord(
      photoId = PhotoId(row.getObject("photo_id", classOf[UUID])),
      analysis = PhotoAnalysis(
        description = row.getString("description"),
        mood = row.getString("mood"),
        palette = RowDecoder.jsonColumn[List[String]](row, "palette", TableLocation),
        memoryCues = RowDecoder.jsonColumn[List[String]](row, "memory_cues", TableLocation),
        sensory = row.getString("sensory"),
        suggestedCaption = row.getString("suggested_caption")
      ),
      model = row.getString("model"),
      analyzedAt = row.getTimestamp("analyzed_at").toInstant
    )
  }

  private val findByIdSql =
    "SELECT photo_id, description, mood, palette, memory_cues, sensory, suggested_caption, model, analyzed_at " +
      "FROM curation.photo_analyses WHERE photo_id = ?"

  def findById(connection: Connection, photoId: PhotoId): IO[Option[PhotoAnalysisRecord]] =
    Sql.queryOne[PhotoAnalysisRecord](connection, findByIdSql, List(SqlValue.Uuid(photoId.value)))

  private val findByIdsSql =
    "SELECT photo_id, description, mood, palette, memory_cues, sensory, suggested_caption, model, analyzed_at " +
      "FROM curation.photo_analyses WHERE photo_id = ANY(?::uuid[]) ORDER BY photo_id"

  def findByIds(connection: Connection, photoIds: List[PhotoId]): IO[List[PhotoAnalysisRecord]] =
    Sql.query[PhotoAnalysisRecord](
      connection,
      findByIdsSql,
      List(SqlValue.Text(photoIds.map(id => id.value.toString).mkString("{", ",", "}")))
    )

  private val upsertSql =
    """INSERT INTO curation.photo_analyses
      |  (photo_id, description, mood, palette, memory_cues, sensory, suggested_caption, model, analyzed_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      |ON CONFLICT (photo_id) DO UPDATE SET
      |  description = EXCLUDED.description,
      |  mood = EXCLUDED.mood,
      |  palette = EXCLUDED.palette,
      |  memory_cues = EXCLUDED.memory_cues,
      |  sensory = EXCLUDED.sensory,
      |  suggested_caption = EXCLUDED.suggested_caption,
      |  model = EXCLUDED.model,
      |  analyzed_at = EXCLUDED.analyzed_at""".stripMargin

  def upsert(connection: Connection, record: PhotoAnalysisRecord): IO[Unit] =
    Sql
      .update(
        connection,
        upsertSql,
        List(
          SqlValue.Uuid(record.photoId.value),
          SqlValue.Text(record.analysis.description),
          SqlValue.Text(record.analysis.mood),
          SqlValue.JsonValue(record.analysis.palette.asJson.noSpaces),
          SqlValue.JsonValue(record.analysis.memoryCues.asJson.noSpaces),
          SqlValue.Text(record.analysis.sensory),
          SqlValue.Text(record.analysis.suggestedCaption),
          SqlValue.Text(record.model),
          SqlValue.InstantValue(record.analyzedAt)
        )
      )
      .void
