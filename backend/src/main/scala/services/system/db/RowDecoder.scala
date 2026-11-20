package services.system.db

import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

import io.circe.Decoder
import io.circe.parser.decode

/** 行级映射：把 ResultSet 的当前行转换为类型化对象。 */
trait RowDecoder[A]:
  def decode(row: ResultSet): A

object RowDecoder:
  def apply[A](decodeRow: ResultSet => A): RowDecoder[A] = new RowDecoder[A]:
    def decode(row: ResultSet): A = decodeRow(row)

  given RowDecoder[String] = apply(_.getString(1))
  given RowDecoder[Int] = apply(_.getInt(1))
  given RowDecoder[Long] = apply(_.getLong(1))
  given RowDecoder[Double] = apply(_.getDouble(1))
  given RowDecoder[Boolean] = apply(_.getBoolean(1))
  given RowDecoder[UUID] = apply(row => row.getObject(1, classOf[UUID]))
  given RowDecoder[Instant] = apply(row => row.getTimestamp(1).toInstant)

  /**
   * 枚举与 jsonb 列的统一严格解码：非法值一律抛 IllegalStateException（Sql.query 在 IO.blocking
   * 内调用 decode，异常因此进入 IO 错误通道），不做静默降级——写入与读取同源，行内出现非法值
   * 即数据完整性事故，静默降级会把事故伪装成正常对象（如未知 status 变 Failed）。
   */
  def enumColumn[A](row: ResultSet, column: String, location: String)(fromString: String => Either[String, A]): A =
    Option(row.getString(column)) match
      case Some(raw) =>
        fromString(raw) match
          case Right(value) => value
          case Left(error)  => throw decodeFailure(location, column, error)
      case None => throw decodeFailure(location, column, "列值为 NULL，但该列不允许为空")

  /** 可空枚举列：NULL → None；非空但非法值 → 抛错（同 [[enumColumn]]）。 */
  def optionalEnumColumn[A](row: ResultSet, column: String, location: String)(
    fromString: String => Either[String, A]
  ): Option[A] =
    Option(row.getString(column)).flatMap { raw =>
      fromString(raw) match
        case Right(value) => Some(value)
        case Left(error)  => throw decodeFailure(location, column, error)
    }

  /** 严格 jsonb 列：非法 JSON 文本或结构不匹配 Decoder → 抛错。 */
  def jsonColumn[A: Decoder](row: ResultSet, column: String, location: String): A =
    Option(row.getString(column)) match
      case Some(raw) =>
        decode[A](raw) match
          case Right(value) => value
          case Left(error)  => throw decodeFailure(location, column, error.getMessage)
      case None => throw decodeFailure(location, column, "列值为 NULL，但该列不允许为空")

  /** 可空 jsonb 列：NULL → None；非法 JSON 或结构不匹配 → 抛错。 */
  def optionalJsonColumn[A: Decoder](row: ResultSet, column: String, location: String): Option[A] =
    Option(row.getString(column)).map { raw =>
      decode[A](raw) match
        case Right(value) => value
        case Left(error)  => throw decodeFailure(location, column, error.getMessage)
    }

  private def decodeFailure(location: String, column: String, reason: String): IllegalStateException =
    IllegalStateException(s"无法解析 $location.$column 的存储值：$reason")
