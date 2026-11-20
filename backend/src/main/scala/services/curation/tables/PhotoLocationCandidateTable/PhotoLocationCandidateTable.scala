package services.curation.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.curation.objects.{LocationCandidate, LocationCandidateId}
import services.gallery.objects.{LocationGranularity, PhotoId}
import services.system.db.{RowDecoder, Sql, SqlValue}

/** curation.photo_location_candidates 的公开表方法（返回 IO[T]，不含业务逻辑）。
  * 建议成功时整体替换：先 deleteByPhotoId 再批量 insert；读取按生成顺序返回。 */
object PhotoLocationCandidateTable:
  private given RowDecoder[LocationCandidate] = RowDecoder { row =>
    LocationCandidate(
      id = LocationCandidateId(row.getObject("id", classOf[UUID])),
      photoId = PhotoId(row.getObject("photo_id", classOf[UUID])),
      name = row.getString("name"),
      latitude = optionalDouble(row, "latitude"),
      longitude = optionalDouble(row, "longitude"),
      granularity = optionalText(row, "granularity").flatMap(value => LocationGranularity.fromString(value).toOption),
      reason = row.getString("reason"),
      model = row.getString("model"),
      generatedAt = row.getTimestamp("generated_at").toInstant
    )
  }

  private val selectColumns =
    """SELECT id, photo_id, name, latitude, longitude, granularity, reason, model, generated_at
      |FROM curation.photo_location_candidates""".stripMargin

  private val findByIdSql = s"$selectColumns WHERE id = ?"

  def findById(connection: Connection, id: LocationCandidateId): IO[Option[LocationCandidate]] =
    Sql.queryOne[LocationCandidate](connection, findByIdSql, List(SqlValue.Uuid(id.value)))

  private val listByPhotoIdSql = s"$selectColumns WHERE photo_id = ? ORDER BY generated_at, id"

  def listByPhotoId(connection: Connection, photoId: PhotoId): IO[List[LocationCandidate]] =
    Sql.query[LocationCandidate](connection, listByPhotoIdSql, List(SqlValue.Uuid(photoId.value)))

  private val deleteByPhotoIdSql = "DELETE FROM curation.photo_location_candidates WHERE photo_id = ?"

  def deleteByPhotoId(connection: Connection, photoId: PhotoId): IO[Unit] =
    Sql.update(connection, deleteByPhotoIdSql, List(SqlValue.Uuid(photoId.value))).void

  private val insertSql =
    """INSERT INTO curation.photo_location_candidates
      |  (id, photo_id, name, latitude, longitude, granularity, reason, model, generated_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""".stripMargin

  def insert(connection: Connection, candidate: LocationCandidate): IO[Unit] =
    Sql
      .update(
        connection,
        insertSql,
        List(
          SqlValue.Uuid(candidate.id.value),
          SqlValue.Uuid(candidate.photoId.value),
          SqlValue.Text(candidate.name),
          candidate.latitude.fold(SqlValue.Null)(SqlValue.DoubleValue.apply),
          candidate.longitude.fold(SqlValue.Null)(SqlValue.DoubleValue.apply),
          candidate.granularity.fold(SqlValue.Null)(value => SqlValue.Text(LocationGranularity.toString(value))),
          SqlValue.Text(candidate.reason),
          SqlValue.Text(candidate.model),
          SqlValue.InstantValue(candidate.generatedAt)
        )
      )
      .void

  private def optionalDouble(row: java.sql.ResultSet, column: String): Option[Double] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.doubleValue }

  private def optionalText(row: java.sql.ResultSet, column: String): Option[String] =
    Option(row.getString(column))
