package services.system.db

import java.sql.{PreparedStatement, Timestamp, Types}
import java.time.Instant
import java.util.UUID

/** 预处理语句的有类型参数；JSONB 参数以字符串写入。 */
enum SqlValue:
  case Text(value: String)
  case Uuid(value: UUID)
  case IntValue(value: Int)
  case LongValue(value: Long)
  case DoubleValue(value: Double)
  case BooleanValue(value: Boolean)
  case InstantValue(value: Instant)
  case JsonValue(value: String)
  case Null

object SqlValue:
  def bind(statement: PreparedStatement, index: Int, value: SqlValue): Unit =
    value match
      case SqlValue.Text(text) => statement.setString(index, text)
      case SqlValue.Uuid(uuid) => statement.setObject(index, uuid)
      case SqlValue.IntValue(number) => statement.setInt(index, number)
      case SqlValue.LongValue(number) => statement.setLong(index, number)
      case SqlValue.DoubleValue(number) => statement.setDouble(index, number)
      case SqlValue.BooleanValue(flag) => statement.setBoolean(index, flag)
      case SqlValue.InstantValue(instant) => statement.setTimestamp(index, Timestamp.from(instant))
      case SqlValue.JsonValue(json) => statement.setObject(index, json, Types.OTHER)
      case SqlValue.Null => statement.setObject(index, null)
