package services.gallery.tables

import java.sql.Connection
import java.util.UUID

import cats.effect.IO

import services.gallery.objects.*
import services.system.db.{RowDecoder, Sql, SqlValue}

/** gallery.photo_locations：照片位置行（一照片最多一条，无记录=未知）；读路径按 exhibition_id 经照片连接。 */
object PhotoLocationTable:
  private val TableLocation = "gallery.photo_locations"

  private given RowDecoder[PhotoLocation] = RowDecoder { row =>
    PhotoLocation(
      photoId = PhotoId(row.getObject("photo_id", classOf[UUID])),
      source = RowDecoder.enumColumn(row, "source", TableLocation)(LocationSource.fromString),
      status = RowDecoder.enumColumn(row, "status", TableLocation)(LocationStatus.fromString),
      name = row.getString("name"),
      latitude = optionalDouble(row, "latitude"),
      longitude = optionalDouble(row, "longitude"),
      granularity = RowDecoder.enumColumn(row, "granularity", TableLocation)(LocationGranularity.fromString),
      updatedAt = row.getTimestamp("updated_at").toInstant
    )
  }

  private val selectColumns =
    """SELECT photo_id, source, status, name, latitude, longitude, granularity, updated_at
      |FROM gallery.photo_locations""".stripMargin

  private val findByIdSql = s"$selectColumns WHERE photo_id = ?"

  def findById(connection: Connection, photoId: PhotoId): IO[Option[PhotoLocation]] =
    Sql.queryOne[PhotoLocation](connection, findByIdSql, List(SqlValue.Uuid(photoId.value)))

  private val listByExhibitionSql =
    s"""SELECT l.photo_id, l.source, l.status, l.name, l.latitude, l.longitude, l.granularity, l.updated_at
       |FROM gallery.photo_locations l
       |JOIN gallery.exhibition_photos p ON p.id = l.photo_id
       |WHERE p.exhibition_id = ?
       |ORDER BY p.created_at, l.photo_id""".stripMargin

  def listByExhibition(connection: Connection, exhibitionId: ExhibitionId): IO[List[PhotoLocation]] =
    Sql.query[PhotoLocation](connection, listByExhibitionSql, List(SqlValue.Uuid(exhibitionId.value)))

  private val listByExhibitionsSql =
    s"""SELECT l.photo_id, l.source, l.status, l.name, l.latitude, l.longitude, l.granularity, l.updated_at
       |FROM gallery.photo_locations l
       |JOIN gallery.exhibition_photos p ON p.id = l.photo_id
       |WHERE p.exhibition_id = ANY(?::uuid[])
       |ORDER BY p.created_at, l.photo_id""".stripMargin

  /** 列表页一次取多个展览的位置，避免逐展览查询。 */
  def listByExhibitions(connection: Connection, exhibitionIds: List[ExhibitionId]): IO[List[PhotoLocation]] =
    if exhibitionIds.isEmpty then IO.pure(Nil)
    else
      val arrayLiteral = exhibitionIds.map(_.value.toString).mkString("{", ",", "}")
      Sql.query[PhotoLocation](connection, listByExhibitionsSql, List(SqlValue.Text(arrayLiteral)))

  private val upsertSql =
    """INSERT INTO gallery.photo_locations
      |  (photo_id, source, status, name, latitude, longitude, granularity, updated_at)
      |VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      |ON CONFLICT (photo_id) DO UPDATE SET
      |  source = EXCLUDED.source,
      |  status = EXCLUDED.status,
      |  name = EXCLUDED.name,
      |  latitude = EXCLUDED.latitude,
      |  longitude = EXCLUDED.longitude,
      |  granularity = EXCLUDED.granularity,
      |  updated_at = EXCLUDED.updated_at""".stripMargin

  def upsert(connection: Connection, location: PhotoLocation): IO[Unit] =
    Sql
      .update(
        connection,
        upsertSql,
        List(
          SqlValue.Uuid(location.photoId.value),
          SqlValue.Text(LocationSource.toString(location.source)),
          SqlValue.Text(LocationStatus.toString(location.status)),
          SqlValue.Text(location.name),
          location.latitude.fold(SqlValue.Null)(SqlValue.DoubleValue.apply),
          location.longitude.fold(SqlValue.Null)(SqlValue.DoubleValue.apply),
          SqlValue.Text(LocationGranularity.toString(location.granularity)),
          SqlValue.InstantValue(location.updatedAt)
        )
      )
      .void

  private val deleteByPhotoIdSql = "DELETE FROM gallery.photo_locations WHERE photo_id = ?"

  def deleteByPhotoId(connection: Connection, photoId: PhotoId): IO[Unit] =
    Sql.update(connection, deleteByPhotoIdSql, List(SqlValue.Uuid(photoId.value))).void

  private def optionalDouble(row: java.sql.ResultSet, column: String): Option[Double] =
    Option(row.getObject(column)).collect { case number: java.lang.Number => number.doubleValue }
