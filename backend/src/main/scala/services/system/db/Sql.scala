package services.system.db

import java.sql.{Connection, PreparedStatement}

import cats.effect.{IO, Resource}

/** 最小类型化 JDBC 访问层：SQL 文本由调用方（表模块）的私有 val 提供。 */
object Sql:
  def query[A](connection: Connection, sql: String, parameters: List[SqlValue] = Nil)(using decoder: RowDecoder[A]): IO[List[A]] =
    withStatement(connection, sql, parameters) { statement =>
      val rows = statement.executeQuery()
      val decoded = Iterator
        .continually(rows.next())
        .takeWhile(identity)
        .map(_ => decoder.decode(rows))
        .toList
      rows.close()
      decoded
    }

  def queryOne[A](connection: Connection, sql: String, parameters: List[SqlValue] = Nil)(using RowDecoder[A]): IO[Option[A]] =
    query[A](connection, sql, parameters).map(_.headOption)

  def update(connection: Connection, sql: String, parameters: List[SqlValue] = Nil): IO[Int] =
    withStatement(connection, sql, parameters)(_.executeUpdate())

  private def withStatement[A](connection: Connection, sql: String, parameters: List[SqlValue])(use: PreparedStatement => A): IO[A] =
    val acquire = IO.blocking {
      val statement = connection.prepareStatement(sql)
      parameters.zipWithIndex.foreach { case (parameter, position) =>
        SqlValue.bind(statement, position + 1, parameter)
      }
      statement
    }
    Resource
      .make(acquire)(statement => IO.blocking(statement.close()))
      .use(statement => IO.blocking(use(statement)))
