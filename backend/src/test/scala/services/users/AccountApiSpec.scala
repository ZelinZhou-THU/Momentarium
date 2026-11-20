package services.users

import java.util.UUID

import cats.effect.IO
import cats.effect.unsafe.implicits.global

import services.FourPagesFixtures
import services.system.api.{ApiException, ErrorCode}
import services.system.db.{Database, Sql, SqlValue}
import services.users.api.{
  ChangePasswordMessage,
  GetMyProfileMessage,
  LoginMessage,
  RegisterMessage,
  ResolveSessionMessage,
  UpdateMyProfileMessage
}
import services.users.objects.UserId
import services.users.tables.SessionTable

class AccountApiSpec extends munit.FunSuite:
  test("资料：默认值 → 更新 → 读取；非法显示名拒绝；改密：旧密码错误拒绝，成功后旧令牌失效、新令牌可用") {
    FourPagesFixtures.withDatabase(scenario).unsafeRunSync()
  }

  private def scenario(database: Database): IO[Unit] =
    val username = s"acct_${UUID.randomUUID().toString.replace("-", "").take(12)}"
    for
      // 注册成功后才持有 userId；之后无论断言是否失败都在 guarantee 中清理本测试创建的行，
      // 避免测试库残留账户/会话/profile（task-11 测试卫生，仅删本测试随机 ID 的行）。
      createdUser <- IO.ref(Option.empty[UserId])
      _ <- (for
             registered <- database.use(connection => RegisterMessage(username, "ExamplePassw0rd").plan(connection))
             userId = registered.user.id
             _ <- createdUser.set(Some(userId))

             initial <- database.use(connection => GetMyProfileMessage(userId).plan(connection))
             _ <- IO(assertEquals((initial.displayName, initial.bio, initial.homepagePublic), (username, "", false)))

             updated <- database.use(connection => UpdateMyProfileMessage(userId, "  林间  ", "喜欢拍雨天", true).plan(connection))
             _ <- IO(assertEquals((updated.displayName, updated.bio, updated.homepagePublic), ("林间", "喜欢拍雨天", true)))
             reread <- database.use(connection => GetMyProfileMessage(userId).plan(connection))
             _ <- IO(assertEquals(reread, updated))
             _ <- expectCode(database.use(connection => UpdateMyProfileMessage(userId, " ", "", false).plan(connection)), ErrorCode.Validation)

             _ <- expectCode(
                    database.use(connection => ChangePasswordMessage(userId, "WrongPassw0rd", "NewPassw0rd!").plan(connection)),
                    ErrorCode.Validation
                  )
             _ <- expectCode(
                    database.use(connection => ChangePasswordMessage(userId, "ExamplePassw0rd", "short").plan(connection)),
                    ErrorCode.Validation
                  )
             changed <- database.use(connection => ChangePasswordMessage(userId, "ExamplePassw0rd", "NewPassw0rd!").plan(connection))
             _ <- expectCode(
                    database.use(connection => ResolveSessionMessage(registered.token).plan(connection)),
                    ErrorCode.Unauthorized
                  )
             resolved <- database.use(connection => ResolveSessionMessage(changed.token).plan(connection))
             _ <- IO(assertEquals(resolved.userId, userId))
             _ <- expectCode(database.use(connection => LoginMessage(username, "ExamplePassw0rd").plan(connection)), ErrorCode.Unauthorized)
             _ <- database.use(connection => LoginMessage(username, "NewPassw0rd!").plan(connection)).void
           yield ()).guarantee(
             createdUser.get.flatMap(_.fold(IO.unit)(userId => cleanup(database, userId)))
           )
    yield ()

  /** 只删除本测试随机创建的账户与会话（删除账户级联 profile）；不清理历史残留。 */
  private def cleanup(database: Database, userId: UserId): IO[Unit] =
    database
      .use { connection =>
        for
          _ <- SessionTable.deleteByUserId(connection, userId)
          _ <- Sql.update(connection, "DELETE FROM users.users WHERE id = ?", List(SqlValue.Uuid(userId.value)))
        yield ()
      }
      .attempt
      .void

  private def expectCode(action: IO[?], code: ErrorCode): IO[Unit] =
    action.attempt.map {
      case Left(ApiException(error)) => assertEquals(error.code, code)
      case other => fail(s"期望 $code，实际 $other")
    }
