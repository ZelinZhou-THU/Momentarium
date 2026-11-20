package services.system.db

import java.sql.Connection

import cats.effect.{IO, Resource}
import com.zaxxer.hikari.{HikariConfig, HikariDataSource}

import services.system.config.DatabaseConfig

/** 进程内唯一的 HikariCP 连接池。 */
final case class Database(dataSource: HikariDataSource):
  def connection: Resource[IO, Connection] =
    Resource.fromAutoCloseable(IO.blocking(dataSource.getConnection))

  def use[A](body: Connection => IO[A]): IO[A] = connection.use(body)

  private val healthCheckSql = "SELECT 1"

  def isHealthy: IO[Boolean] =
    use(connection => Sql.queryOne[Int](connection, healthCheckSql)).map(_.contains(1))

object Database:
  private val MaximumPoolSize = 10

  def resource(config: DatabaseConfig): Resource[IO, Database] =
    Resource.make(IO.blocking(open(config)).map(Database.apply))(database => IO.blocking(database.dataSource.close()))

  private def open(config: DatabaseConfig): HikariDataSource =
    val hikari = new HikariConfig()
    hikari.setPoolName("momentarium-pool")
    // 显式指定驱动类：避免 Hikari 依赖 DriverManager 的 ServiceLoader/TCCL 自注册（测试并发下曾偶发拿不到 driver）。
    hikari.setDriverClassName("org.postgresql.Driver")
    hikari.setJdbcUrl(config.url)
    hikari.setUsername(config.user)
    hikari.setPassword(config.password)
    hikari.setMaximumPoolSize(MaximumPoolSize)
    hikari.setAutoCommit(true)
    hikari.setConnectionTimeout(10000)
    new HikariDataSource(hikari)
