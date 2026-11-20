package services.gallery.utils

/** PostgreSQL 错误归类：把并发唯一约束冲突映射为契约错误，不让底层异常穿透。 */
private[gallery] object PostgresErrors:
  private val UniqueViolationState = "23505"
  private val MaxCauseDepth = 8

  def isUniqueViolation(error: Throwable): Boolean =
    def loop(candidate: Throwable, depth: Int): Boolean =
      if candidate == null || depth <= 0 then false
      else
        candidate match
          case sql: java.sql.SQLException =>
            sql.getSQLState == UniqueViolationState ||
            loop(sql.getNextException, depth - 1) ||
            loop(sql.getCause, depth - 1)
          case other => loop(other.getCause, depth - 1)
    loop(error, MaxCauseDepth)
