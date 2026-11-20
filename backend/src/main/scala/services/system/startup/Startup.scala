package services.system.startup

import java.nio.file.Path

import cats.effect.IO
import cats.syntax.all.*
import com.comcast.ip4s.{Port, ipv4}
import org.http4s.HttpApp
import org.http4s.ember.server.EmberServerBuilder
import org.http4s.implicits.*
import org.slf4j.LoggerFactory

import services.gallery.routes.{CoverRenderRoutes, CoverRoutes, PhotoRoutes}
import services.system.ai.AiRuntime
import services.system.assets.{HealthRoutes, StaticRoutes}
import services.system.config.{AiMode, AppConfig, DotEnv}
import services.system.db.Database
import services.system.geocode.GeocodingRuntime
import services.system.routes.{ApiRouter, TokenResolver, RouteRegistry}
import services.users.api.ResolveSessionMessage

/** 启动编排：加载 .env → 建连接池 → 跑表初始化 → 组合路由 → 启动 http4s。 */
object Startup:
  private val logger = LoggerFactory.getLogger(getClass)

  def serve: IO[Unit] =
    for
      dotEnv <- DotEnv.load(Path.of(".env"))
      config <- loadConfig(dotEnv ++ sys.env)
      _ <- AiRuntime.initialize(config.ai)
      _ <- GeocodingRuntime.initialize(config.geocoding)
      listenPort <- IO.fromOption(Port.fromInt(config.port))(new IllegalArgumentException(s"非法端口: ${config.port}"))
      _ <- Database.resource(config.database).use { database =>
        for
          _ <- AppRuntime.initialize(config, database)
          _ <- Initializers.run(database)
          _ <- announce(config)
          _ <- EmberServerBuilder
                 .default[IO]
                 .withHost(ipv4"0.0.0.0")
                 .withPort(listenPort)
                 .withHttpApp(application(config, database))
                 .build
                 .use(_ => IO.never)
        yield ()
      }
    yield ()

  private def loadConfig(environment: Map[String, String]): IO[AppConfig] =
    AppConfig.load(environment) match
      case Right(config) => IO.pure(config)
      case Left(error) => IO.raiseError(new IllegalStateException(error))

  private def announce(config: AppConfig): IO[Unit] =
    IO {
      logger.info(
        "Momentarium 平台服务启动：端口 {}，DATA_DIR={}，AI_MODE={}",
        config.port,
        config.dataDir.toString,
        AiMode.toString(config.ai.mode)
      )
      if config.ai.mode == AiMode.Live && !config.ai.baseUrl.stripSuffix("/").endsWith("/go") then
        logger.warn(
          "AI_BASE_URL 未指向 Go 套餐端点（应以 /go 结尾）：live 调用可能按量计费，请确认 usage.opencode.billing_source 为 go/go-plus"
        )
    }

  private def application(config: AppConfig, database: Database): HttpApp[IO] =
    val routes =
      HealthRoutes.routes(database) <+>
        ApiRouter.routes(RouteRegistry.apiMessages, tokenResolver, database) <+>
        PhotoRoutes.routes(database, config.dataDir, config.contributions, tokenResolver) <+>
        CoverRoutes.routes(database, config.dataDir, tokenResolver) <+>
        CoverRenderRoutes.routes(database, config.dataDir, tokenResolver) <+>
        StaticRoutes.routes(Path.of("..", "frontend", "dist"), Path.of("..", "frontend", "public", "vendor"))
    routes.orNotFound

  private def tokenResolver: TokenResolver =
    TokenResolver((connection, rawToken) =>
      ResolveSessionMessage(rawToken).plan(connection).map(_.userId)
    )
