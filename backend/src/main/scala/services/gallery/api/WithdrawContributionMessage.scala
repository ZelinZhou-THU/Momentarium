package services.gallery.api

import java.sql.Connection

import cats.effect.{IO, Ref}
import cats.syntax.all.*

import services.gallery.objects.{ContributionId, ContributionStatus}
import services.gallery.tables.{ContributionTable, ExhibitionPhotoTable, ExhibitionTable, PhotoMemoryTable}
import services.gallery.utils.{ContributionAccess, CurrentTime, PhotoRemoval}
import services.system.api.{APIWithTokenMessage, EmptyResponse}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/** withdrawcontribution（v2.7）：本人撤回投稿（被撤销参与仍可撤回），并清理其已采用副本。
  *
  * - 没有已采用讲述 → 直接撤回；
  * - 关联已有照片 → 只删讲述、保留照片；
  * - 照片由投稿采用新建（任意投稿）且无其他讲述 → 照片移除（被 active 快照引用则归档，否则物理删除并清理文件/封面）；
  * - 已撤回时仍先清理遗留 adoption（旧版本残留）再幂等返回；重复撤回不重复删已不存在内容。
  */
final case class WithdrawContributionMessage(userId: UserId, contributionId: ContributionId)
    extends APIWithTokenMessage[EmptyResponse]:
  override def plan(connection: Connection): IO[EmptyResponse] =
    for
      dataDirectory <- AppRuntime.config.map(_.dataDir)
      staleFiles <- IO.ref(List.empty[String])
      result <- Transaction(connection)(withdraw(connection, staleFiles))
      files <- staleFiles.get
      _ <- PhotoRemoval.deleteFiles(dataDirectory, files)
    yield result

  private def withdraw(connection: Connection, staleFiles: Ref[IO, List[String]]): IO[EmptyResponse] =
    for
      contribution <- ContributionAccess.requireOwnContribution(connection, contributionId, userId)
      // 已撤回也要先清理旧版本遗留的 adoption；重复调用时已不存在内容不会重复删除。
      _ <- cleanupAdoption(connection, staleFiles)
      _ <-
        if contribution.status == ContributionStatus.Withdrawn then IO.unit
        else CurrentTime.now.flatMap(now => ContributionTable.withdraw(connection, contributionId, userId, now)).void
    yield EmptyResponse()

  /** 撤回前清理该投稿的已采用讲述与（必要时）由投稿新建的草稿照片。 */
  private def cleanupAdoption(connection: Connection, staleFiles: Ref[IO, List[String]]): IO[Unit] =
    PhotoMemoryTable.findByContributionId(connection, contributionId).flatMap {
      case None => IO.unit
      case Some(memory) =>
        ExhibitionPhotoTable.findById(connection, memory.photoId).flatMap {
          case None => IO.unit
          case Some(photo) =>
            for
              now <- CurrentTime.now
              _ <- PhotoMemoryTable.delete(connection, photo.id, memory.id)
              remaining <- PhotoMemoryTable.listByPhotoId(connection, photo.id)
              _ <-
                if PhotoRemoval.isAdoptionPhoto(photo, memory) && remaining.isEmpty then
                  PhotoRemoval
                    .removeOrArchive(connection, photo, now)
                    .flatMap(files => staleFiles.set(files) *> ExhibitionTable.touchDraft(connection, photo.exhibitionId, now))
                else ExhibitionTable.touchDraft(connection, photo.exhibitionId, now) // 讲述是 AI 输入（v0.15.0）：移除后场景过期
            yield ()
        }
    }
