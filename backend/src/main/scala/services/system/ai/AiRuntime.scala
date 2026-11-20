package services.system.ai

import cats.effect.{IO, Ref}

import services.system.api.{ApiError, ApiException}
import services.system.config.AiConfig

/**
 * 启动时装配的 AI 端口持有者。
 *
 * `plan(connection)` 只接收数据库连接（spec 6.3），业务 API 无法从参数拿到 AI 端口，
 * 因此由 Startup 在启动时调用一次 `initialize(config.ai)`，API 通过 `ports` 取用。
 * 未初始化时取端口是明确的启动错误，不会静默回退到 fake（避免 live 模式意外变假）。
 */
object AiRuntime:

  private val portsRef: Ref[IO, Option[AiPorts]] = Ref.unsafe[IO, Option[AiPorts]](None)

  /** 按 AI_MODE 装配真实适配器或确定性 fake；live 缺密钥时让启动失败。 */
  def initialize(config: AiConfig): IO[Unit] =
    IO.fromEither(AiPorts.fromConfig(config).left.map(message => new IllegalStateException(message)))
      .flatMap(initializeWith)

  /** 测试/嵌入装配：直接注入端口（生产启动仍用 initialize(config)）。 */
  def initializeWith(ports: AiPorts): IO[Unit] =
    portsRef.set(Some(ports))

  /** 仅测试用：回到未初始化状态，避免跨 suite 的全局状态影响装配语义断言。 */
  private[ai] def reset: IO[Unit] =
    portsRef.set(None)

  def ports: IO[AiPorts] =
    portsRef.get.flatMap {
      case Some(ports) => IO.pure(ports)
      case None => IO.raiseError(ApiException(ApiError.internal("AI 端口尚未初始化：启动时必须调用 AiRuntime.initialize(config.ai)")))
    }
