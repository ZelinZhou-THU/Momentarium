package services.scene.utils

import cats.effect.{Deferred, Fiber, IO, Outcome, Ref}

import services.scene.objects.SceneRunId
import services.scene.tables.SceneRunTable
import services.system.db.Database

/**
 * 运行中的场景生成/修复 fiber 登记表（spec §9.6 取消语义）：runId → Fiber，供 cancelscene 主动中断。
 *
 * - 启动 fiber 前先用 Deferred 挡住 body，确保登记完成后才真正开始，避免「跑完但还没登记」的竞态；
 * - fiber 被取消时由 onCancel 条件写 cancelled（与 cancelscene 的数据库更新等价、幂等）；
 * - 进程重启后登记表为空，遗留活跃运行由 SceneRunTableInitializer 统一置 failed(SERVER_RESTARTED)。
 */
private[scene] object SceneJobs:

  private type SceneFiber = Fiber[IO, Throwable, Unit]

  private val fibers: Ref[IO, Map[SceneRunId, SceneFiber]] = Ref.unsafe[IO, Map[SceneRunId, SceneFiber]](Map.empty)

  /** 启动并登记生成/修复 fiber；调用方不等待其完成。 */
  def launch(database: Database, runId: SceneRunId, body: IO[Unit]): IO[Unit] =
    for
      gate <- Deferred[IO, Unit]
      fiber <- (gate.get *> runAndMarkCancelled(database, runId, body)).start
      _ <- fibers.update(_.updated(runId, fiber))
      _ <- gate.complete(()).void
    yield ()

  /** 取出并移除 fiber；没有登记说明该运行没有活跃生成（如 AwaitingCapture 由前端渲染）。 */
  def take(runId: SceneRunId): IO[Option[SceneFiber]] =
    fibers.modify { registered =>
      registered.get(runId) match
        case Some(fiber) => (registered - runId, Some(fiber))
        case None => (registered, None)
    }

  /** 仅供测试观察当前登记数量，避免用例间互相污染。 */
  def activeCount: IO[Int] = fibers.get.map(_.size)

  private def runAndMarkCancelled(database: Database, runId: SceneRunId, body: IO[Unit]): IO[Unit] =
    body
      .guaranteeCase {
        case Outcome.Canceled() => markCancelled(database, runId)
        case _ => IO.unit
      }
      .guarantee(fibers.update(_ - runId))

  private def markCancelled(database: Database, runId: SceneRunId): IO[Unit] =
    for
      now <- CurrentTime.now
      _ <- database.use(connection => SceneRunTable.cancelNonTerminal(connection, runId, now)).void
    yield ()
