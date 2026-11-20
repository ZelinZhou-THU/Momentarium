package services.system.assets

import cats.effect.IO
import io.circe.Json
import org.http4s.circe.CirceEntityCodec.*
import org.http4s.dsl.io.*
import org.http4s.{HttpRoutes, Response, Status}
import org.slf4j.LoggerFactory

import services.system.db.Database

/** GET /api/health：包含数据库连通性检查。 */
object HealthRoutes:
  private val logger = LoggerFactory.getLogger(getClass)

  def routes(database: Database): HttpRoutes[IO] =
    HttpRoutes.of[IO] { case GET -> Root / "api" / "health" =>
      database.isHealthy.attempt.flatMap {
        case Right(true) => IO.pure(Response[IO](Status.Ok).withEntity(Json.obj("status" -> Json.fromString("ok"))))
        case Right(false) => IO.pure(unavailable)
        case Left(error) =>
          IO(logger.warn("健康检查数据库探活失败", error)).as(unavailable)
      }
    }

  private def unavailable: Response[IO] =
    Response[IO](Status.ServiceUnavailable).withEntity(
      Json.obj(
        "status" -> Json.fromString("error"),
        "reason" -> Json.fromString("DATABASE_UNAVAILABLE")
      )
    )
