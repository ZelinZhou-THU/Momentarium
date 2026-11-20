package services.system.db

import java.sql.Connection

import cats.effect.IO

/** PostgreSQL 事务级 advisory lock：同一 key 的并发事务串行执行，事务结束自动释放。
  *
  * SQL 收口在共享基础设施中，业务 utils 只传领域 key，不直接持有 SQL。
  */
object AdvisoryLock:

  private val acquireTransactionLockSql =
    "SELECT count(*) FROM (SELECT pg_advisory_xact_lock(?) AS locked) AS advisory_lock"

  def acquireTransactionLock(connection: Connection, key: Long): IO[Unit] =
    Sql.queryOne[Int](connection, acquireTransactionLockSql, List(SqlValue.LongValue(key))).void
