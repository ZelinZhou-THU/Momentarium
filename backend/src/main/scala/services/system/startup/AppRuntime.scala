package services.system.startup

import cats.effect.{IO, Ref}

import services.system.api.{ApiError, ApiException}
import services.system.config.AppConfig
import services.system.db.Database

/** 启动时装配的进程级上下文：plan(connection) 没有配置参数，业务 API 通过它取 DATA_DIR 与连接池（异步 fiber 使用）。 */
object AppRuntime:
  private val stateRef: Ref[IO, Option[(AppConfig, Database)]] = Ref.unsafe[IO, Option[(AppConfig, Database)]](None)

  def initialize(config: AppConfig, database: Database): IO[Unit] = stateRef.set(Some((config, database)))

  def config: IO[AppConfig] =
    stateRef.get.flatMap {
      case Some((config, _)) => IO.pure(config)
      case None => IO.raiseError(notInitialized)
    }

  def database: IO[Database] =
    stateRef.get.flatMap {
      case Some((_, database)) => IO.pure(database)
      case None => IO.raiseError(notInitialized)
    }

  private val notInitialized: ApiException =
    ApiException(ApiError.internal("AppRuntime 尚未初始化：启动时必须调用 AppRuntime.initialize(config, database)"))
