package services.system.db

import java.sql.Connection

import cats.effect.IO

/** 显式事务边界：多步写操作必须在同一个事务内完成。 */
object Transaction:
  def apply[A](connection: Connection)(body: IO[A]): IO[A] =
    IO.blocking(connection.getAutoCommit).flatMap { previousAutoCommit =>
      IO.blocking(connection.setAutoCommit(false)) *>
        body.attempt
          .flatMap {
            case Right(value) => IO.blocking(connection.commit()).as(value)
            case Left(error) => IO.blocking(connection.rollback()) *> IO.raiseError[A](error)
          }
          .guarantee(IO.blocking(connection.setAutoCommit(previousAutoCommit)))
    }
