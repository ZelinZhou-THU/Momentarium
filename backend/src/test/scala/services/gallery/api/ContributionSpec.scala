package services.gallery.api

import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.nio.file.{Files, Path}
import java.time.Instant
import java.util.UUID
import javax.imageio.ImageIO

import cats.effect.IO
import cats.effect.unsafe.implicits.global
import cats.syntax.all.*

import services.curation.tables.PhotoAnalysisTableInitializer
import services.gallery.objects.*
import services.gallery.objects.apiTypes.*
import services.gallery.tables.*
import services.gallery.utils.PhotoStorage
import services.scene.objects.{SceneBrief, SceneRun, SceneRunId, SceneRunStatus, SceneSource}
import services.scene.tables.{SceneRunTable, SceneRunTableInitializer}
import services.system.api.{ApiException, ErrorCode, ValidationReason, ConflictReason}
import services.system.config.AppConfig
import services.system.config.ContributionConfig
import services.system.config.DotEnv
import services.system.db.{Database, Sql, SqlValue, Transaction}
import services.system.migrations.AdoptedPhotoBackfill
import services.system.startup.AppRuntime
import services.users.api.{RegisterMessage, UpdateMyProfileMessage}
import services.users.objects.UserId
import services.users.tables.{ProfileTableInitializer, SessionTableInitializer, UserTableInitializer}

/** 阶段 2 共同投稿后端集成测试：邀请/参与/投稿/审阅/采用/讲述/配额/私有性/原地更新。
  * 使用真实 momentarium_test 测试库与随机 UUID；每个测试的展览/账户在 guarantee 中清理。 */
class ContributionSpec extends munit.FunSuite:
  private val t0 = Instant.parse("2026-11-01T08:00:00Z")
  private val password = "ExamplePassw0rd"

  test("邀请与参与：创建/预览/加入幂等/关闭后拒绝/自加入拒绝/撤销后终态与越权 404") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_invite")
        joiner <- registerUser(fixture, "joiner_invite")
        outsider <- registerUser(fixture, "outsider_invite")
        exhibition <- seedExhibition(fixture, owner, "邀请展", photoCount = 3)
        invite <- databaseUse(fixture)(connection => CreateContributionInviteMessage(owner, exhibition.id).plan(connection))
        preview <- databaseUse(fixture)(connection => GetContributionInviteMessage(invite.token).plan(connection))
        _ <- IO(assertEquals(preview.exhibitionTitle, "邀请展"))
        _ <- IO(assertEquals(preview.status, ContributionInviteStatus.Active))
        _ <- IO(assert(preview.inviterName.nonEmpty, "未设置展示名时退回用户名，不会为空"))
        _ <- databaseUse(fixture)(connection => UpdateMyProfileMessage(owner, "林间拾光", "", true).plan(connection))
        namedPreview <- databaseUse(fixture)(connection => GetContributionInviteMessage(invite.token).plan(connection))
        _ <- IO(assertEquals(namedPreview.inviterName, "林间拾光", "设置展示名后邀请页显示展示名"))
        invalidInvite <- attempt(databaseUse(fixture)(connection => GetContributionInviteMessage("invalid-token").plan(connection)))
        _ <- IO(assertEquals(invalidInvite.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        selfJoin <- attempt(databaseUse(fixture)(connection => JoinContributionMessage(owner, invite.token).plan(connection)))
        _ <- IO(assertEquals(selfJoin.left.toOption.flatMap(reasonOf), Some(ValidationReason.toString(ValidationReason.ContributionSelfNotAllowed))))
        membership <- databaseUse(fixture)(connection => JoinContributionMessage(joiner, invite.token).plan(connection))
        _ <- IO(assertEquals(membership.exhibitionId, exhibition.id))
        _ <- IO(assertEquals(membership.status, ContributorStatus.Active))
        again <- databaseUse(fixture)(connection => JoinContributionMessage(joiner, invite.token).plan(connection))
        _ <- IO(assertEquals(again.joinedAt, membership.joinedAt))
        closed <- databaseUse(fixture) { connection =>
                    CloseContributionInviteMessage(owner, exhibition.id, invite.inviteId).plan(connection)
                  }
        _ <- IO(assertEquals(closed.status, ContributionInviteStatus.Closed))
        closedPreview <- databaseUse(fixture)(connection => GetContributionInviteMessage(invite.token).plan(connection))
        _ <- IO(assertEquals(closedPreview.status, ContributionInviteStatus.Closed))
        rejectedJoin <- attempt(databaseUse(fixture)(connection => JoinContributionMessage(outsider, invite.token).plan(connection)))
        _ <- IO(assertEquals(rejectedJoin.left.toOption.flatMap(reasonOf), Some(ConflictReason.toString(ConflictReason.InviteClosed))))
        management <- databaseUse(fixture)(connection => GetContributionManagementMessage(owner, exhibition.id).plan(connection))
        _ <- IO(assertEquals(management.invites.map(_.id), List(invite.inviteId)))
        _ <- IO(assertEquals(management.participants.map(_.contributorId), List(joiner)))
        _ <- IO(assertEquals(management.participants.map(_.status), List(ContributorStatus.Active)))
        revoke <- databaseUse(fixture)(connection => RevokeContributorMessage(owner, exhibition.id, joiner).plan(connection))
        _ <- IO(assertEquals(revoke, services.system.api.EmptyResponse()))
        revokeAgain <- databaseUse(fixture)(connection => RevokeContributorMessage(owner, exhibition.id, joiner).plan(connection))
        _ <- IO(assertEquals(revokeAgain, services.system.api.EmptyResponse()))
        freshInvite <- databaseUse(fixture)(connection => CreateContributionInviteMessage(owner, exhibition.id).plan(connection))
        rejoin <- attempt(databaseUse(fixture)(connection => JoinContributionMessage(joiner, freshInvite.token).plan(connection)))
        _ <- IO(assertEquals(rejoin.left.toOption.flatMap(reasonOf), Some(ConflictReason.toString(ConflictReason.ParticipantRevoked))))
        otherManagement <- attempt(
                              databaseUse(fixture)(connection => GetContributionManagementMessage(outsider, exhibition.id).plan(connection))
                            )
        _ <- IO(assertEquals(otherManagement.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        afterRevoke <- databaseUse(fixture)(connection => GetContributionManagementMessage(owner, exhibition.id).plan(connection))
        _ <- IO(assertEquals(afterRevoke.participants.map(_.status), List(ContributorStatus.Revoked)))
      yield ()
      scenario
    }
  }

  test("投稿上传：批量上限/配额 400，单文件大小与类型失败 200 failures，替换单文件版本+1 并清理旧文件") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_upload")
        contributor <- registerUser(fixture, "contributor_upload")
        exhibition <- seedExhibition(fixture, owner, "上传展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        smallConfig = fixture.config.copy(maxBatchFiles = 2, maxFileBytes = 4L * 1024 * 1024)
        threeFiles <- prepareCandidates(fixture, List(validJpeg(10, 10, 0xff0000), validJpeg(10, 10, 0x00ff00), validJpeg(10, 10, 0x0000ff)))
        batchLimit <- attempt(
                        databaseUse(fixture)(connection =>
                          ContributionUploadMessage(contributor, exhibition.id, None, fixture.dataDir, threeFiles, smallConfig)
                            .plan(connection)
                        )
                      )
        _ <- IO(assertEquals(batchLimit.left.toOption.flatMap(reasonOf), Some(ValidationReason.toString(ValidationReason.ContributionBatchLimit))))
        tooLarge <- prepareCandidates(fixture, List(Array.fill[Byte](5000)(1)))
        smallFileConfig = smallConfig.copy(maxFileBytes = 1024L)
        tooLargeResponse <- databaseUse(fixture)(connection =>
                              ContributionUploadMessage(
                                contributor,
                                exhibition.id,
                                None,
                                fixture.dataDir,
                                tooLarge,
                                smallFileConfig.copy(maxBatchFiles = 10)
                              ).plan(connection)
                            )
        _ <- IO(assertEquals(tooLargeResponse.failures.map(_.reason), List(UploadFailureReason.TooLarge)))
        badType <- prepareCandidates(fixture, List(Array[Byte](1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)))
        badTypeResponse <- databaseUse(fixture)(connection =>
                             ContributionUploadMessage(
                               contributor,
                               exhibition.id,
                               None,
                               fixture.dataDir,
                               badType,
                               smallConfig.copy(maxFileBytes = 4L * 1024 * 1024)
                             ).plan(connection)
                           )
        _ <- IO(assertEquals(badTypeResponse.failures.map(_.reason), List(UploadFailureReason.UnsupportedType)))
        validFiles <- prepareCandidates(fixture, List(validJpeg(20, 12, 0xff0000)))
        created <- databaseUse(fixture)(connection =>
                     ContributionUploadMessage(contributor, exhibition.id, None, fixture.dataDir, validFiles, smallConfig)
                       .plan(connection)
                   )
        _ <- IO(assertEquals(created.contributions.map(_.status), List(ContributionStatus.Draft)))
        contribution = created.contributions.head
        oldOriginalKey <- databaseUse[Option[String]](fixture)(connection =>
                            ContributionTable.findById(connection, contribution.id).map(_.flatMap(_.originalKey))
                          )
        replacementFile <- prepareCandidates(fixture, List(validJpeg(20, 12, 0x0000ff)))
        replaced <- databaseUse(fixture)(connection =>
                      ContributionUploadMessage(
                        contributor,
                        exhibition.id,
                        Some(contribution.id),
                        fixture.dataDir,
                        replacementFile,
                        smallConfig
                      ).plan(connection)
                    )
        _ <- IO(assertEquals(replaced.contributions.map(_.version), List(2)))
        _ <- IO(assertEquals(replaced.contributions.map(_.status), List(ContributionStatus.Draft)))
        oldFileStillThere <- oldOriginalKey match
                               case Some(key) => PhotoStorage.exists(fixture.dataDir, key)
                               case None => IO.pure(true)
        _ <- IO(assert(!oldFileStillThere, "替换后旧版本投稿文件应清理"))
        replacedRow <- databaseUse(fixture)(connection =>
                         ContributionTable.findById(connection, contribution.id).flatMap {
                           case Some(found) => IO.pure(found)
                           case None => IO.raiseError(new IllegalStateException("替换后投稿不存在"))
                         }
                       )
        _ <- IO(assert(replacedRow.originalKey.exists(key => Files.isRegularFile(fixture.dataDir.resolve(key))), "新版本文件应存在"))
        multiReplacement <- prepareCandidates(fixture, List(validJpeg(4, 4, 0x111111), validJpeg(4, 4, 0x222222)))
        multiReject <- attempt(
                         databaseUse(fixture)(connection =>
                           ContributionUploadMessage(
                             contributor,
                             exhibition.id,
                             Some(contribution.id),
                             fixture.dataDir,
                             multiReplacement,
                             smallConfig
                           ).plan(connection)
                         )
                       )
        _ <- IO(assertEquals(multiReject.left.toOption.map(_.error.code), Some(ErrorCode.BadRequest)))
        quotaConfig = smallConfig.copy(maxPhotosPerUser = 1, maxPhotosPerExhibition = 100)
        quotaFiles <- prepareCandidates(fixture, List(validJpeg(6, 6, 0x00ffff)))
        quotaReject <- attempt(
                         databaseUse(fixture)(connection =>
                           ContributionUploadMessage(contributor, exhibition.id, None, fixture.dataDir, quotaFiles, quotaConfig)
                             .plan(connection)
                         )
                       )
        _ <- IO(
               assertEquals(
                 quotaReject.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionQuotaPhotos))
               )
             )
      yield ()
      scenario
    }
  }

  test("提交与列表范围：草稿不入创建者审阅列表、回忆校验、撤回后内容 404 且列表保留 withdrawn") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_list")
        contributor <- registerUser(fixture, "contributor_list")
        outsider <- registerUser(fixture, "outsider_list")
        exhibition <- seedExhibition(fixture, owner, "列表展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        draftList <- databaseUse(fixture)(connection =>
                       ListContributionsMessage(contributor, None).plan(connection)
                     )
        _ <- IO(assertEquals(draftList.contributions.map(_.status), List(ContributionStatus.Draft)))
        ownerDraftScope <- databaseUse(fixture)(connection =>
                             ListContributionsMessage(owner, Some(exhibition.id)).plan(connection)
                           )
        _ <- IO(assertEquals(ownerDraftScope.contributions, Nil, "创建者审阅列表不含 draft"))
        emptyMemory <- attempt(
                         databaseUse(fixture)(connection =>
                           UpdateContributionMessage(contributor, uploaded.id, "   ", suggestedCaption = None, location = None, submit = true, removePhoto = false).plan(connection)
                         )
                       )
        _ <- IO(assertEquals(emptyMemory.left.toOption.flatMap(reasonOf), Some(ValidationReason.toString(ValidationReason.ContributionMemoryInvalid))))
        submitted <- databaseUse(fixture)(connection =>
                       UpdateContributionMessage(
                         contributor,
                         uploaded.id,
                         "那天的风很轻",
                         suggestedCaption = None,
                         location = Some(ContributionLocationInput("海边", Some(33.45), Some(126.94))),
                         submit = true,
                         removePhoto = false
                       ).plan(connection)
                     )
        _ <- IO(assertEquals(submitted.status, ContributionStatus.Submitted))
        _ <- IO(assertEquals(submitted.version, 2))
        ownerList <- databaseUse(fixture)(connection => ListContributionsMessage(owner, Some(exhibition.id)).plan(connection))
        _ <- IO(assertEquals(ownerList.contributions.map(_.id), List(uploaded.id)))
        _ <- IO(assertEquals(ownerList.contributions.head.location.map(_.source), Some(LocationSource.Manual)))
        outsiderList <- attempt(databaseUse(fixture)(connection => ListContributionsMessage(outsider, Some(exhibition.id)).plan(connection)))
        _ <- IO(assertEquals(outsiderList.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        withdrawn <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, uploaded.id).plan(connection))
        _ <- IO(assertEquals(withdrawn, services.system.api.EmptyResponse()))
        withdrawAgain <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, uploaded.id).plan(connection))
        _ <- IO(assertEquals(withdrawAgain, services.system.api.EmptyResponse()))
        afterWithdraw <- databaseUse(fixture)(connection => ListContributionsMessage(contributor, None).plan(connection))
        _ <- IO(assertEquals(afterWithdraw.contributions.map(_.status), List(ContributionStatus.Withdrawn)))
        contentGone <- attempt(
                         databaseUse(fixture)(connection =>
                           GetContributionContentMessage(Some(contributor), uploaded.id, PhotoVariant.Full, fixture.dataDir)
                             .plan(connection)
                         )
                       )
        _ <- IO(assertEquals(contentGone.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        updateWithdrawn <- attempt(
                             databaseUse(fixture)(connection =>
                               UpdateContributionMessage(contributor, uploaded.id, "再改一次", suggestedCaption = None, location = None, submit = true, removePhoto = false).plan(connection)
                             )
                           )
        _ <- IO(assertEquals(updateWithdrawn.left.toOption.flatMap(reasonOf), Some(ConflictReason.toString(ConflictReason.ContributionWithdrawn))))
      yield ()
      scenario
    }
  }

  test("投稿私有图片：匿名 401、非本人/非创建者 404、本人与创建者可读、被撤销后仍可读自己的稿") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_binary")
        contributor <- registerUser(fixture, "contributor_binary")
        outsider <- registerUser(fixture, "outsider_binary")
        exhibition <- seedExhibition(fixture, owner, "私有展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        anonymous <- attempt(
                       databaseUse(fixture)(connection =>
                         GetContributionContentMessage(None, uploaded.id, PhotoVariant.Full, fixture.dataDir).plan(connection)
                       )
                     )
        _ <- IO(assertEquals(anonymous.left.toOption.map(_.error.code), Some(ErrorCode.Unauthorized)))
        outsiderRead <- attempt(
                          databaseUse(fixture)(connection =>
                            GetContributionContentMessage(Some(outsider), uploaded.id, PhotoVariant.Full, fixture.dataDir)
                              .plan(connection)
                          )
                        )
        _ <- IO(assertEquals(outsiderRead.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        ownRead <- databaseUse(fixture)(connection =>
                     GetContributionContentMessage(Some(contributor), uploaded.id, PhotoVariant.Full, fixture.dataDir)
                       .plan(connection)
                   )
        _ <- IO(assert(ownRead.bytes.nonEmpty))
        ownerThumb <- databaseUse(fixture)(connection =>
                        GetContributionContentMessage(Some(owner), uploaded.id, PhotoVariant.Thumb, fixture.dataDir)
                          .plan(connection)
                      )
        _ <- IO(assertEquals(ownerThumb.mimeType, "image/jpeg"))
        _ <- databaseUse(fixture)(connection => RevokeContributorMessage(owner, exhibition.id, contributor).plan(connection))
        afterRevokeRead <- databaseUse(fixture)(connection =>
                             GetContributionContentMessage(Some(contributor), uploaded.id, PhotoVariant.Full, fixture.dataDir)
                               .plan(connection)
                           )
        _ <- IO(assert(afterRevokeRead.bytes.nonEmpty, "被撤销参与仍可查看自己的投稿"))
      yield ()
      scenario
    }
  }

  test("历史已有照片采用数据兼容：removememory/withdraw 只删讲述、保留原照片") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_legacy_existing")
        contributor <- registerUser(fixture, "contributor_legacy_existing")
        exhibition <- seedExhibition(fixture, owner, "历史既有照片展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        targetPhoto = exhibition.photos.head
        legacyPhotoContribution <- uploadOne(fixture, contributor, exhibition.id)
        legacySubmitted <- updateContribution(fixture, contributor, legacyPhotoContribution.id, "旧版讲述", submit = true)
        now = Instant.now
        legacyMemoryId <- IO.randomUUID.map(PhotoMemoryId.apply)
        _ <- databaseUse(fixture)(connection =>
               PhotoMemoryTable.insert(
                 connection,
                 PhotoMemory(
                   id = legacyMemoryId,
                   photoId = targetPhoto.id,
                   contributionId = legacySubmitted.id,
                   contributorUserId = contributor,
                   contributorName = "旧版投稿者",
                   text = "旧版讲述",
                   adoptedVersion = legacySubmitted.version,
                   createdAt = now,
                   updatedAt = now
                 )
               )
             )
        detail <- databaseUse(fixture)(connection => GetExhibitionMessage(owner, exhibition.id).plan(connection))
        _ <- IO(
               assertEquals(
                 detail.groups.flatMap(_.photos).find(_.id == targetPhoto.id).map(_.memories.map(_.text)),
                 Some(List("旧版讲述"))
               )
             )
        _ <- databaseUse(fixture)(connection => RemoveMemoryMessage(owner, targetPhoto.id, legacyMemoryId).plan(connection))
        keptPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, targetPhoto.id))
        _ <- IO(assertEquals(keptPhoto.isDefined, true, "历史已有照片目标只删讲述"))
        keptMemories <- databaseUse(fixture)(connection => PhotoMemoryTable.listByPhotoId(connection, targetPhoto.id))
        _ <- IO(assertEquals(keptMemories, Nil))
        secondPhoto <- uploadOne(fixture, contributor, exhibition.id)
        secondSubmitted <- updateContribution(fixture, contributor, secondPhoto.id, "待撤回旧讲述", submit = true)
        withdrawMemoryId <- IO.randomUUID.map(PhotoMemoryId.apply)
        _ <- databaseUse(fixture)(connection =>
               PhotoMemoryTable.insert(
                 connection,
                 PhotoMemory(
                   id = withdrawMemoryId,
                   photoId = exhibition.photos(1).id,
                   contributionId = secondSubmitted.id,
                   contributorUserId = contributor,
                   contributorName = "旧版投稿者",
                   text = "待撤回旧讲述",
                   adoptedVersion = secondSubmitted.version,
                   createdAt = Instant.now,
                   updatedAt = Instant.now
                 )
               )
             )
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, secondSubmitted.id).plan(connection))
        photoAfterWithdraw <- databaseUse(fixture)(connection =>
                             ExhibitionPhotoTable.findById(connection, exhibition.photos(1).id)
                           )
        _ <- IO(assertEquals(photoAfterWithdraw.isDefined, true, "历史已有照片目标撤回只删讲述"))
        memoriesAfterWithdraw <- databaseUse(fixture)(connection =>
                                  PhotoMemoryTable.listByPhotoId(connection, exhibition.photos(1).id)
                                )
        _ <- IO(assertEquals(memoriesAfterWithdraw, Nil))
      yield ()
      scenario
    }
  }

  test("采用新建照片与原地更新：复制文件/touchDraft；回忆变化不碰文件但递增版本（讲述是 AI 输入）；文件变化替换并再次 touchDraft") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_adopt_new")
        contributor <- registerUser(fixture, "contributor_adopt_new")
        exhibition <- seedExhibition(fixture, owner, "新建照片展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- databaseUse(fixture)(connection =>
                       UpdateContributionMessage(contributor, uploaded.id, "海边的故事", suggestedCaption = None, location = None, submit = true, removePhoto = false).plan(connection)
                     )
        exhibitionBefore <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        adoption <- databaseUse(fixture)(connection =>
                      AdoptContributionMessage(
                        owner,
                        submitted.id,
                        submitted.version,
                        Some("海边的照片"),
                        Some(AdoptedLocationInput("海边", Some(33.4), Some(126.9), "area"))
                      ).plan(connection)
                    )
        photo <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assert(photo.isDefined, "采用后应创建草稿照片"))
        photosAfter <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        _ <- IO(assertEquals(photosAfter.size, 4))
        _ <- IO(assertEquals(photo.map(_.caption), Some("海边的照片")))
        photoFileExists <- PhotoStorage.exists(fixture.dataDir, photo.get.storageKey)
        _ <- IO(assert(photoFileExists, "草稿照片文件应存在"))
        locationAfter <- databaseUse(fixture)(connection => PhotoLocationTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(locationAfter.map(_.status), Some(LocationStatus.Confirmed)))
        exhibitionAfterCreate <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- IO(
               assertEquals(
                 exhibitionAfterCreate.map(_.curationVersion),
                 exhibitionBefore.map(_.curationVersion + 1),
                 "采用新照片递增 curation_version"
               )
             )
        firstBytes <- IO.blocking(Files.readAllBytes(fixture.dataDir.resolve(photo.get.storageKey)))
        second <- databaseUse(fixture)(connection =>
                    UpdateContributionMessage(contributor, submitted.id, "只改讲述", suggestedCaption = None, location = None, submit = true, removePhoto = false).plan(connection)
                  )
        reAdopted <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, second.version, None, None).plan(connection)
                     )
        _ <- IO(assertEquals(reAdopted.photoId, adoption.photoId, "目标锁定：同目标原地更新"))
        _ <- IO(assertEquals(reAdopted.memoryId, adoption.memoryId, "原地更新同一条讲述"))
        bytesAfterMemoryUpdate <- IO.blocking(Files.readAllBytes(fixture.dataDir.resolve(photo.get.storageKey)))
        _ <- IO(assertEquals(bytesAfterMemoryUpdate.toList, firstBytes.toList, "仅回忆变化不替换照片文件"))
        exhibitionAfterMemory <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- IO(
               assertEquals(
                 exhibitionAfterMemory.map(_.curationVersion),
                 exhibitionAfterCreate.map(_.curationVersion + 1),
                 "回忆文字变化递增 curation_version（场景随之过期）"
               )
             )
        replacementBytes = validJpeg(18, 18, 0x00aa55)
        replacementFile <- prepareCandidates(fixture, List(replacementBytes))
        replaced <- databaseUse(fixture)(connection =>
                      ContributionUploadMessage(
                        contributor,
                        exhibition.id,
                        Some(uploaded.id),
                        fixture.dataDir,
                        replacementFile,
                        fixture.config
                      ).plan(connection)
                    )
        _ <- IO(assertEquals(replaced.contributions.map(_.version), List(second.version + 1)))
        reAdoptedFile <- databaseUse(fixture)(connection =>
                           AdoptContributionMessage(owner, submitted.id, second.version + 1, None, None).plan(connection)
                         )
        _ <- IO(assertEquals(reAdoptedFile.photoId, adoption.photoId))
        bytesAfterReplace <- IO.blocking(Files.readAllBytes(fixture.dataDir.resolve(photo.get.storageKey)))
        _ <- IO(assertEquals(bytesAfterReplace.toList, replacementBytes.toList, "文件变化时替换草稿照片文件"))
        exhibitionAfterFile <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- IO(
               assertEquals(
                 exhibitionAfterFile.map(_.curationVersion),
                 exhibitionAfterMemory.map(_.curationVersion + 1),
                 "文件变化再次递增 curation_version"
               )
             )
      yield ()
      scenario
    }
  }

  test("权限与安全：创建者不能投稿自己的展览、撤销后不可提交、非参与者上传 404") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_permission")
        contributor <- registerUser(fixture, "contributor_permission")
        outsider <- registerUser(fixture, "outsider_permission")
        exhibition <- seedExhibition(fixture, owner, "权限展", photoCount = 3)
        files <- prepareCandidates(fixture, List(validJpeg(8, 8, 0x112233)))
        selfUpload <- attempt(
                        databaseUse(fixture)(connection =>
                          ContributionUploadMessage(owner, exhibition.id, None, fixture.dataDir, files, fixture.config)
                            .plan(connection)
                        )
                      )
        _ <- IO(assertEquals(selfUpload.left.toOption.flatMap(reasonOf), Some(ValidationReason.toString(ValidationReason.ContributionSelfNotAllowed))))
        outsiderUpload <- attempt(
                             databaseUse(fixture)(connection =>
                               ContributionUploadMessage(outsider, exhibition.id, None, fixture.dataDir, files, fixture.config)
                                 .plan(connection)
                             )
                           )
        _ <- IO(assertEquals(outsiderUpload.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- databaseUse(fixture)(connection =>
                       UpdateContributionMessage(contributor, uploaded.id, "待采用", suggestedCaption = None, location = None, submit = true, removePhoto = false).plan(connection)
                     )
        _ <- databaseUse(fixture)(connection => RevokeContributorMessage(owner, exhibition.id, contributor).plan(connection))
        updateAfterRevoke <- attempt(
                               databaseUse(fixture)(connection =>
                                 UpdateContributionMessage(contributor, uploaded.id, "无法提交", suggestedCaption = None, location = None, submit = true, removePhoto = false).plan(connection)
                               )
                             )
        _ <- IO(assertEquals(updateAfterRevoke.left.toOption.flatMap(reasonOf), Some(ConflictReason.toString(ConflictReason.ParticipantRevoked))))
        adoptionAfterRevoke <- attempt(
                                 databaseUse(fixture)(connection =>
                                   AdoptContributionMessage(owner, uploaded.id, submitted.version, None, None)
                                     .plan(connection)
                                 )
                               )
        _ <- IO(
               assertEquals(
                 adoptionAfterRevoke.left.toOption.flatMap(reasonOf),
                 Some(ConflictReason.toString(ConflictReason.ParticipantRevoked))
               )
             )
        withdrawAfterRevoke <- databaseUse(fixture)(connection =>
                                WithdrawContributionMessage(contributor, uploaded.id).plan(connection)
                              )
        _ <- IO(assertEquals(withdrawAfterRevoke, services.system.api.EmptyResponse()))
      yield ()
      scenario
    }
  }

  test("v1.12 投稿必须带图：draft 保存/无图提交 400/补图提交/草稿移除照片/提交后移除照片 400") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_text")
        contributor <- registerUser(fixture, "contributor_text")
        exhibition <- seedExhibition(fixture, owner, "必须带图展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        draft <- createTextContribution(fixture, contributor, exhibition.id, "只写一点")
        _ <- IO(assertEquals(draft.status, ContributionStatus.Draft, "create 只建 draft"))
        _ <- IO(assertEquals(draft.file, None, "draft 可暂未附图"))
        _ <- IO(assertEquals(draft.version, 1))
        saved <- updateContribution(fixture, contributor, draft.id, "补充后保存", submit = false)
        _ <- IO(assertEquals(saved.status, ContributionStatus.Draft))
        _ <- IO(assertEquals(saved.version, 2))
        submitNoPhoto <- attempt(
                           updateContribution(fixture, contributor, draft.id, "最终回忆", submit = true)
                         )
        _ <- IO(
               assertEquals(
                 submitNoPhoto.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionPhotoRequired)),
                 "无图 submit=true 400"
               )
             )
        files <- prepareCandidates(fixture, List(validJpeg(16, 12, 0x884422)))
        attached <- databaseUse(fixture)(connection =>
                      ContributionUploadMessage(contributor, exhibition.id, Some(draft.id), fixture.dataDir, files, fixture.config)
                        .plan(connection)
                    )
        _ <- IO(assertEquals(attached.contributions.head.file.isDefined, true, "附加照片后 file 非空"))
        _ <- IO(assertEquals(attached.contributions.head.status, ContributionStatus.Draft, "附加照片不改变 draft"))
        _ <- IO(assertEquals(attached.contributions.head.version, 3))
        content <- databaseUse(fixture)(connection =>
                     GetContributionContentMessage(Some(contributor), draft.id, PhotoVariant.Thumb, fixture.dataDir)
                       .plan(connection)
                   )
        _ <- IO(assert(content.bytes.nonEmpty))
        submitted <- updateContribution(
                       fixture,
                       contributor,
                       draft.id,
                       "最终回忆",
                       submit = true,
                       location = Some(ContributionLocationInput("海边", Some(33.45), Some(126.94)))
                     )
        _ <- IO(assertEquals(submitted.status, ContributionStatus.Submitted))
        _ <- IO(assertEquals(submitted.version, 4))
        _ <- IO(assertEquals(submitted.location.map(_.name), Some("海边")))
        removeSubmitted <- attempt(
                             updateContribution(fixture, contributor, draft.id, "最终回忆", submit = false, removePhoto = true)
                           )
        _ <- IO(
               assertEquals(
                 removeSubmitted.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionPhotoRequired)),
                 "submitted 不能移除照片"
               )
             )
        draftPhoto <- uploadOne(fixture, contributor, exhibition.id)
        _ <- IO(assertEquals(draftPhoto.status, ContributionStatus.Draft))
        removedDraft <- updateContribution(fixture, contributor, draftPhoto.id, "", submit = false, removePhoto = true)
        _ <- IO(assertEquals(removedDraft.file, None, "draft 可移除照片"))
        _ <- IO(assertEquals(removedDraft.status, ContributionStatus.Draft, "移除照片保持 draft"))
        gone <- attempt(
                  databaseUse(fixture)(connection =>
                    GetContributionContentMessage(Some(contributor), draftPhoto.id, PhotoVariant.Full, fixture.dataDir)
                      .plan(connection)
                  )
                )
        _ <- IO(assertEquals(gone.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        reFiles <- prepareCandidates(fixture, List(validJpeg(14, 10, 0x335577)))
        _ <- databaseUse(fixture)(connection =>
               ContributionUploadMessage(contributor, exhibition.id, Some(draftPhoto.id), fixture.dataDir, reFiles, fixture.config)
                 .plan(connection)
             )
        resubmitted <- updateContribution(fixture, contributor, draftPhoto.id, "补图后重提", submit = true)
        _ <- IO(assertEquals(resubmitted.status, ContributionStatus.Submitted))
        _ <- IO(assertEquals(resubmitted.file.isDefined, true))
      yield ()
      scenario
    }
  }

  test("拒绝与重提：declined 摘要幂等、declined→draft→submitted、拒绝已采用 409、版本冲突 409") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_decline")
        contributor <- registerUser(fixture, "contributor_decline")
        exhibition <- seedExhibition(fixture, owner, "拒绝展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        first <- uploadOne(fixture, contributor, exhibition.id)
        firstSubmitted <- updateContribution(fixture, contributor, first.id, "第一次回忆", submit = true)
        declined <- databaseUse(fixture)(connection =>
                      DeclineContributionMessage(owner, first.id, firstSubmitted.version).plan(connection)
                    )
        _ <- IO(assertEquals(declined.status, ContributionStatus.Declined))
        idempotent <- databaseUse(fixture)(connection =>
                        DeclineContributionMessage(owner, first.id, firstSubmitted.version).plan(connection)
                      )
        _ <- IO(assertEquals(idempotent.status, ContributionStatus.Declined))
        adoptDeclined <- attempt(
                           databaseUse(fixture)(connection =>
                             AdoptContributionMessage(owner, first.id, firstSubmitted.version, None, None).plan(connection)
                           )
                         )
        _ <- IO(assertEquals(adoptDeclined.left.toOption.flatMap(reasonOf), Some(ConflictReason.toString(ConflictReason.ContributionDeclined))))
        removeDeclined <- attempt(
                            updateContribution(fixture, contributor, first.id, "第一次回忆", submit = false, removePhoto = true)
                          )
        _ <- IO(
               assertEquals(
                 removeDeclined.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionPhotoRequired)),
                 "declined 不能移除照片"
               )
             )
        saved <- updateContribution(fixture, contributor, first.id, "修改后保存", submit = false)
        _ <- IO(assertEquals(saved.status, ContributionStatus.Draft, "declined 保存后回到 draft"))
        resubmitted <- updateContribution(fixture, contributor, first.id, "重新提交", submit = true)
        _ <- IO(assertEquals(resubmitted.status, ContributionStatus.Submitted))
        adopted <- databaseUse(fixture)(connection =>
                     AdoptContributionMessage(owner, first.id, resubmitted.version, None, None).plan(connection)
                   )
        _ <- IO(assert(adopted.photoId != exhibition.photos.head.id || adopted.photoId != exhibition.photos(1).id))
        declineAdopted <- attempt(
                            databaseUse(fixture)(connection =>
                              DeclineContributionMessage(owner, first.id, resubmitted.version).plan(connection)
                            )
                          )
        _ <- IO(
               assertEquals(
                 declineAdopted.left.toOption.flatMap(reasonOf),
                 Some(ConflictReason.toString(ConflictReason.ContributionAlreadyAdopted))
               )
             )
        second <- uploadOne(fixture, contributor, exhibition.id)
        secondSubmitted <- updateContribution(fixture, contributor, second.id, "第二条回忆", submit = true)
        wrongVersion <- attempt(
                          databaseUse(fixture)(connection =>
                            DeclineContributionMessage(owner, secondSubmitted.id, secondSubmitted.version + 1).plan(connection)
                          )
                        )
        _ <- IO(
               assertEquals(
                 wrongVersion.left.toOption.flatMap(reasonOf),
                 Some(ConflictReason.toString(ConflictReason.ContributionVersionConflict))
               )
             )
        draft <- createTextContribution(fixture, contributor, exhibition.id, "草稿")
        draftDecline <- attempt(
                          databaseUse(fixture)(connection =>
                            DeclineContributionMessage(owner, draft.id, draft.version).plan(connection)
                          )
                        )
        _ <- IO(assertEquals(draftDecline.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
      yield ()
      scenario
    }
  }

  test("历史纯文字投稿兼容：不能采用（400）、可拒绝/撤回，补图后可重提") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_text_adopt")
        contributor <- registerUser(fixture, "contributor_text_adopt")
        exhibition <- seedExhibition(fixture, owner, "历史纯文字展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        text <- createTextContribution(fixture, contributor, exhibition.id, "历史纯文字回忆")
        _ <- databaseUse(fixture)(connection =>
               Sql.update(
                 connection,
                 "UPDATE gallery.contributions SET status = 'submitted' WHERE id = ?",
                 List(SqlValue.Uuid(text.id.value))
               )
             )
        photosBefore <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        reject <- attempt(
                    databaseUse(fixture)(connection =>
                      AdoptContributionMessage(owner, text.id, text.version, None, None).plan(connection)
                    )
                  )
        _ <- IO(
               assertEquals(
                 reject.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionPhotoRequired))
               )
             )
        photosAfter <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        _ <- IO(assertEquals(photosAfter.size, photosBefore.size, "不能采用历史纯文字，不新建照片"))
        memories <- databaseUse(fixture)(connection => PhotoMemoryTable.findByContributionId(connection, text.id))
        _ <- IO(assertEquals(memories, None))
        submitNoPhoto <- attempt(
                           updateContribution(fixture, contributor, text.id, "补全回忆", submit = true)
                         )
        _ <- IO(
               assertEquals(
                 submitNoPhoto.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionPhotoRequired)),
                 "历史纯文字无图 submit 400"
               )
             )
        files <- prepareCandidates(fixture, List(validJpeg(12, 9, 0x226699)))
        _ <- databaseUse(fixture)(connection =>
               ContributionUploadMessage(contributor, exhibition.id, Some(text.id), fixture.dataDir, files, fixture.config)
                 .plan(connection)
             )
        resubmitted <- updateContribution(fixture, contributor, text.id, "补图后重提", submit = true)
        _ <- IO(assertEquals(resubmitted.status, ContributionStatus.Submitted))
        _ <- IO(assertEquals(resubmitted.file.isDefined, true, "补图后历史纯文字可重提"))
        legacy <- createTextContribution(fixture, contributor, exhibition.id, "待拒绝撤回的旧文字")
        _ <- databaseUse(fixture)(connection =>
               Sql.update(
                 connection,
                 "UPDATE gallery.contributions SET status = 'submitted' WHERE id = ?",
                 List(SqlValue.Uuid(legacy.id.value))
               )
             )
        declined <- databaseUse(fixture)(connection =>
                      DeclineContributionMessage(owner, legacy.id, legacy.version).plan(connection)
                    )
        _ <- IO(assertEquals(declined.status, ContributionStatus.Declined))
        withdrawn <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, legacy.id).plan(connection))
        _ <- IO(assertEquals(withdrawn, services.system.api.EmptyResponse()))
      yield ()
      scenario
    }
  }

  test("配额只统计有照片投稿；纯文字不限条数；既有投稿行在幂等迁移后仍可读") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_quota_text")
        contributor <- registerUser(fixture, "contributor_quota_text")
        exhibition <- seedExhibition(fixture, owner, "配额展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        quotaConfig = fixture.config.copy(maxPhotosPerUser = 1, maxPhotosPerExhibition = 100)
        textOne <- createTextContribution(fixture, contributor, exhibition.id, "文字一")
        _ <- createTextContribution(fixture, contributor, exhibition.id, "文字二")
        _ <- createTextContribution(fixture, contributor, exhibition.id, "文字三")
        files <- prepareCandidates(fixture, List(validJpeg(10, 10, 0xff0000)))
        photoContribution <- databaseUse(fixture)(connection =>
                               ContributionUploadMessage(
                                 contributor,
                                 exhibition.id,
                                 None,
                                 fixture.dataDir,
                                 files,
                                 quotaConfig
                               ).plan(connection)
                             )
        _ <- IO(assertEquals(photoContribution.contributions.head.file.isDefined, true))
        moreFiles <- prepareCandidates(fixture, List(validJpeg(10, 10, 0x00ff00)))
        quotaReject <- attempt(
                         databaseUse(fixture)(connection =>
                           ContributionUploadMessage(contributor, exhibition.id, None, fixture.dataDir, moreFiles, quotaConfig)
                             .plan(connection)
                         )
                       )
        _ <- IO(
               assertEquals(
                 quotaReject.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionQuotaPhotos))
               )
             )
        migrated <- databaseUse(fixture) { connection =>
                      for
                        _ <- ContributionTableInitializer.initialize(connection)
                        _ <- ContributionTableInitializer.initialize(connection)
                        row <- ContributionTable.findById(connection, photoContribution.contributions.head.id)
                        textRow <- ContributionTable.findById(connection, textOne.id)
                      yield (row, textRow)
                    }
        _ <- IO(assert(migrated._1.isDefined, "既有照片投稿在幂等迁移后仍可读"))
        _ <- IO(assertEquals(migrated._1.flatMap(_.originalKey).isDefined, true))
        _ <- IO(assertEquals(migrated._2.flatMap(_.originalKey), None, "纯文字投稿迁移后图片列保持 NULL"))
      yield ()
      scenario
    }
  }

  test("建议图注：创建/编辑/清空、trim 空存 null、120 码点边界、控制字符 400、摘要输出") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_caption")
        contributor <- registerUser(fixture, "contributor_caption")
        exhibition <- seedExhibition(fixture, owner, "建议图注展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        created <- createTextContribution(
                     fixture,
                     contributor,
                     exhibition.id,
                     "回忆",
                     suggestedCaption = Some("  灯塔下的黄昏  ")
                   )
        _ <- IO(assertEquals(created.suggestedCaption, Some("灯塔下的黄昏"), "创建时 trim 后保存"))
        edited <- updateContribution(
                    fixture,
                    contributor,
                    created.id,
                    "回忆",
                    submit = false,
                    suggestedCaption = Some("新的建议图注")
                  )
        _ <- IO(assertEquals(edited.suggestedCaption, Some("新的建议图注")))
        _ <- IO(assertEquals(edited.version, 2, "建议图注变化递增版本"))
        cleared <- updateContribution(
                     fixture,
                     contributor,
                     created.id,
                     "回忆",
                     submit = false,
                     suggestedCaption = Some("   ")
                   )
        _ <- IO(assertEquals(cleared.suggestedCaption, None, "trim 后空串存 null"))
        _ <- IO(assertEquals(cleared.version, 3))
        list <- databaseUse(fixture)(connection => ListContributionsMessage(contributor, None).plan(connection))
        _ <- IO(assertEquals(list.contributions.flatMap(_.suggestedCaption), Nil))
        maxCaption = List.fill(120)("🌊").mkString
        atLimit <- createTextContribution(fixture, contributor, exhibition.id, "边界", suggestedCaption = Some(maxCaption))
        _ <- IO(assertEquals(atLimit.suggestedCaption.map(value => value.codePointCount(0, value.length)), Some(120)))
        overLimit = List.fill(121)("🌊").mkString
        tooLong <- attempt(
                     databaseUse(fixture)(connection =>
                       CreateContributionMessage(contributor, exhibition.id, "超长", Some(overLimit), None)
                         .plan(connection)
                     )
                   )
        _ <- IO(
               assertEquals(
                 tooLong.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionCaptionInvalid))
               )
             )
        control <- attempt(
                     databaseUse(fixture)(connection =>
                       CreateContributionMessage(contributor, exhibition.id, "控制字符", Some("图注\n第二行"), None)
                         .plan(connection)
                     )
                   )
        _ <- IO(
               assertEquals(
                 control.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionCaptionInvalid))
               )
             )
        updateControl <- attempt(
                           updateContribution(
                             fixture,
                             contributor,
                             created.id,
                             "回忆",
                             submit = false,
                             suggestedCaption = Some("a\u0000b")
                           )
                         )
        _ <- IO(
               assertEquals(
                 updateControl.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionCaptionInvalid))
               )
             )
      yield ()
      scenario
    }
  }

  test("采用图注：新照片缺省继承建议图注、显式空串清空、显式非空 trim、控制字符 400") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_adopt_caption")
        contributor <- registerUser(fixture, "contributor_adopt_caption")
        exhibition <- seedExhibition(fixture, owner, "采用图注展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        first <- uploadOne(fixture, contributor, exhibition.id)
        firstSubmitted <- updateContribution(
                            fixture,
                            contributor,
                            first.id,
                            "第一段回忆",
                            submit = true,
                            suggestedCaption = Some("投稿建议图注")
                          )
        firstAdoption <- databaseUse(fixture)(connection =>
                           AdoptContributionMessage(owner, firstSubmitted.id, firstSubmitted.version, None, None)
                             .plan(connection)
                         )
        firstPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, firstAdoption.photoId))
        _ <- IO(assertEquals(firstPhoto.map(_.caption), Some("投稿建议图注"), "caption 缺失时继承建议图注"))
        second <- uploadOne(fixture, contributor, exhibition.id)
        secondSubmitted <- updateContribution(
                             fixture,
                             contributor,
                             second.id,
                             "第二段回忆",
                             submit = true,
                             suggestedCaption = Some("会被策展人清空")
                           )
        secondAdoption <- databaseUse(fixture)(connection =>
                            AdoptContributionMessage(
                              owner,
                              secondSubmitted.id,
                              secondSubmitted.version,
                              Some(""),
                              None
                            ).plan(connection)
                          )
        secondPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, secondAdoption.photoId))
        _ <- IO(assertEquals(secondPhoto.map(_.caption), Some(""), "显式空串写空"))
        third <- uploadOne(fixture, contributor, exhibition.id)
        thirdSubmitted <- updateContribution(
                            fixture,
                            contributor,
                            third.id,
                            "第三段回忆",
                            submit = true,
                            suggestedCaption = Some("预填图注")
                          )
        thirdAdoption <- databaseUse(fixture)(connection =>
                           AdoptContributionMessage(
                             owner,
                             thirdSubmitted.id,
                             thirdSubmitted.version,
                             Some("  策展人图注  "),
                             None
                           ).plan(connection)
                         )
        thirdPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, thirdAdoption.photoId))
        _ <- IO(assertEquals(thirdPhoto.map(_.caption), Some("策展人图注"), "显式非空 trim 后写入"))
        fourth <- uploadOne(fixture, contributor, exhibition.id)
        fourthSubmitted <- updateContribution(
                             fixture,
                             contributor,
                             fourth.id,
                             "第四段回忆",
                             submit = true,
                             suggestedCaption = None
                           )
        invalidAdoption <- attempt(
                             databaseUse(fixture)(connection =>
                               AdoptContributionMessage(
                                 owner,
                                 fourthSubmitted.id,
                                 fourthSubmitted.version,
                                 Some("a\nb"),
                                 None
                               ).plan(connection)
                             )
                           )
        _ <- IO(
               assertEquals(
                 invalidAdoption.left.toOption.flatMap(reasonOf),
                 Some(ValidationReason.toString(ValidationReason.ContributionCaptionInvalid)),
                 "新建照片的显式图注包含控制字符 400"
               )
             )
      yield ()
      scenario
    }
  }

  test("采用生命周期去重：移除新建照片讲述后再采用不新增照片，旧照片与文件被清理，重复移除幂等") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_dedupe")
        contributor <- registerUser(fixture, "contributor_dedupe")
        exhibition <- seedExhibition(fixture, owner, "去重展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "第一段回忆", submit = true)
        first <- databaseUse(fixture)(connection =>
                   AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                 )
        firstPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, first.photoId))
        photo = firstPhoto.getOrElse(throw new IllegalStateException("采用未创建照片"))
        firstKeys = List(photo.storageKey, photo.thumbKey, PhotoStorage.displayKey(exhibition.id, photo.id))
        _ <- IO(assert(firstKeys.forall(key => Files.isRegularFile(fixture.dataDir.resolve(key))), "采用后照片文件存在"))
        _ <- databaseUse(fixture)(connection => RemoveMemoryMessage(owner, photo.id, first.memoryId).plan(connection))
        removedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, first.photoId))
        _ <- IO(assertEquals(removedPhoto, None, "无其他讲述时新建照片被物理删除"))
        _ <- IO(assertEquals(firstKeys.map(key => Files.exists(fixture.dataDir.resolve(key))), List(false, false, false), "物理删除清理文件"))
        photosAfterRemoval <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        _ <- IO(assertEquals(photosAfterRemoval.size, 3, "地图照片数回落"))
        detail <- databaseUse(fixture)(connection => GetExhibitionMessage(owner, exhibition.id).plan(connection))
        _ <- IO(assertEquals(detail.groups.flatMap(_.photos).size, 3))
        second <- databaseUse(fixture)(connection =>
                    AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                  )
        _ <- IO(assert(second.photoId != first.photoId, "再次采用新建新的照片而不是复用已删行"))
        photosAfterReAdoption <- databaseUse(fixture)(connection =>
                                    ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
                                  )
        _ <- IO(assertEquals(photosAfterReAdoption.size, 4, "再次采用只新增一张，不累积重复"))
        repeatRemove <- attempt(
                          databaseUse(fixture)(connection =>
                            RemoveMemoryMessage(owner, second.photoId, second.memoryId).plan(connection)
                          )
                        )
        _ <- IO(assertEquals(repeatRemove.isRight, true))
        photosFinal <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        _ <- IO(assertEquals(photosFinal.size, 3))
        idempotentRemove <- attempt(
                             databaseUse(fixture)(connection =>
                               RemoveMemoryMessage(owner, second.photoId, second.memoryId).plan(connection)
                             )
                           )
        _ <- IO(assertEquals(idempotentRemove.isRight, true, "重复移除同一讲述幂等"))
      yield ()
      scenario
    }
  }

  test("撤回清理：新建照片投稿撤回后删照片与文件；已有照片投稿撤回只删讲述；重复撤回幂等") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_withdraw_cleanup")
        contributor <- registerUser(fixture, "contributor_withdraw_cleanup")
        exhibition <- seedExhibition(fixture, owner, "撤回清理展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "会被撤回的回忆", submit = true)
        adoption <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                     )
        adoptedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        photo = adoptedPhoto.getOrElse(throw new IllegalStateException("采用未创建照片"))
        keys = List(photo.storageKey, photo.thumbKey, PhotoStorage.displayKey(exhibition.id, photo.id))
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, submitted.id).plan(connection))
        withdrawnPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(withdrawnPhoto, None, "撤回新建照片投稿清理照片"))
        _ <- IO(assertEquals(keys.map(key => Files.exists(fixture.dataDir.resolve(key))), List(false, false, false)))
        withdrawnList <- databaseUse(fixture)(connection => ListContributionsMessage(contributor, None).plan(connection))
        _ <- IO(assertEquals(withdrawnList.contributions.find(_.id == submitted.id).map(_.status), Some(ContributionStatus.Withdrawn)))
        repeatWithdraw <- attempt(
                            databaseUse(fixture)(connection =>
                              WithdrawContributionMessage(contributor, submitted.id).plan(connection)
                            )
                          )
        _ <- IO(assertEquals(repeatWithdraw.isRight, true, "重复撤回幂等"))
        photosAfterWithdraw <- databaseUse(fixture)(connection =>
                                 ExhibitionPhotoTable.listByExhibition(connection, exhibition.id)
                               )
        _ <- IO(assertEquals(photosAfterWithdraw.size, 3))
        text <- createTextContribution(fixture, contributor, exhibition.id, "历史已有照片讲述")
        legacyTarget = exhibition.photos.head
        legacyMemoryId <- IO.randomUUID.map(PhotoMemoryId.apply)
        legacyTime = Instant.now
        _ <- databaseUse(fixture)(connection =>
               PhotoMemoryTable.insert(
                 connection,
                 PhotoMemory(
                   id = legacyMemoryId,
                   photoId = legacyTarget.id,
                   contributionId = text.id,
                   contributorUserId = contributor,
                   contributorName = "历史投稿者",
                   text = "历史已有照片讲述",
                   adoptedVersion = 1,
                   createdAt = legacyTime,
                   updatedAt = legacyTime
                 )
               )
             )
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, text.id).plan(connection))
        existingPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, legacyTarget.id))
        _ <- IO(assertEquals(existingPhoto.isDefined, true, "历史已有照片目标撤回只删讲述"))
        existingMemories <- databaseUse(fixture)(connection => PhotoMemoryTable.listByPhotoId(connection, legacyTarget.id))
        _ <- IO(assertEquals(existingMemories, Nil, "只删除该投稿的讲述"))
        photosFinal <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        _ <- IO(assertEquals(photosFinal.size, 3))
      yield ()
      scenario
    }
  }

  test("已发布快照中的新建照片：撤回只归档不物理删，公开页仍可读且文件保留") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_archive_withdraw")
        contributor <- registerUser(fixture, "contributor_archive_withdraw")
        exhibition <- seedExhibition(fixture, owner, "归档撤回展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "发布后撤回的回忆", submit = true)
        adoption <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                     )
        adoptedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        photo = adoptedPhoto.getOrElse(throw new IllegalStateException("采用未创建照片"))
        _ <- databaseUse(fixture)(connection =>
               ExhibitionPhotoTable.updatePlacement(connection, photo.id, exhibition.id, exhibition.groupId, 3, "")
             )
        runPhotos <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        exhibitionRow <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- databaseUse(fixture)(connection =>
               val run = succeededRun(owner, exhibition.id, runPhotos.map(_.id)).copy(
                 curationVersion = exhibitionRow.map(_.curationVersion).getOrElse(1),
                 createdAt = Instant.now,
                 updatedAt = Instant.now
               )
               SceneRunTable.insert(connection, run) *>
                 ExhibitionTable.setCurrentSceneRun(connection, exhibition.id, run.id, run.updatedAt)
              )
        _ <- databaseUse(fixture)(connection => PublishExhibitionMessage(owner, exhibition.id).plan(connection))
        publicBefore <- databaseUse(fixture)(connection => GetPublishedExhibitionMessage(exhibition.id).plan(connection))
        _ <- IO(assertEquals(publicBefore.photos.exists(_.id == photo.id), true, "发布快照包含新建照片"))
        keys = List(photo.storageKey, photo.thumbKey, PhotoStorage.displayKey(exhibition.id, photo.id))
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, submitted.id).plan(connection))
        archived <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assert(archived.flatMap(_.archivedAt).isDefined, "被 active 快照引用的照片撤回后归档"))
        _ <- IO(assert(keys.forall(key => Files.isRegularFile(fixture.dataDir.resolve(key))), "归档不删文件"))
        publicAfter <- databaseUse(fixture)(connection => GetPublishedExhibitionMessage(exhibition.id).plan(connection))
        _ <- IO(assertEquals(publicAfter.photos.find(_.id == photo.id).flatMap(_.memories.headOption).map(_.text), Some("发布后撤回的回忆")))
      yield ()
      scenario
    }
  }

  test("照片有其他讲述：移除/撤回不删照片；DeletePhoto 物理删除清理文件、归档保留文件") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_other_memory")
        contributor <- registerUser(fixture, "contributor_other_memory")
        exhibition <- seedExhibition(fixture, owner, "其他讲述展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "第一段回忆", submit = true)
        adoption <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                     )
        text <- createTextContribution(fixture, contributor, exhibition.id, "历史附加讲述")
        sharedMemoryId <- IO.randomUUID.map(PhotoMemoryId.apply)
        sharedTime = Instant.now
        _ <- databaseUse(fixture)(connection =>
               PhotoMemoryTable.insert(
                 connection,
                 PhotoMemory(
                   id = sharedMemoryId,
                   photoId = adoption.photoId,
                   contributionId = text.id,
                   contributorUserId = contributor,
                   contributorName = "历史投稿者",
                   text = "历史附加讲述",
                   adoptedVersion = 1,
                   createdAt = sharedTime,
                   updatedAt = sharedTime
                 )
               )
             )
        sharedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        sharedKeys = sharedPhoto.toList.flatMap(photo =>
                       List(photo.storageKey, photo.thumbKey, PhotoStorage.displayKey(exhibition.id, photo.id))
                     )
        _ <- IO(assert(sharedKeys.forall(key => Files.isRegularFile(fixture.dataDir.resolve(key)))))
        versionBeforeRemove <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id)).map(_.map(_.curationVersion))
        _ <- databaseUse(fixture)(connection => RemoveMemoryMessage(owner, adoption.photoId, adoption.memoryId).plan(connection))
        versionAfterRemove <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id)).map(_.map(_.curationVersion))
        _ <- IO(assertEquals(versionAfterRemove, versionBeforeRemove.map(_ + 1), "移除讲述递增 curation_version（讲述是 AI 输入，场景随之过期）"))
        keptPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(keptPhoto.isDefined, true, "照片还有其他讲述时保留"))
        memoriesAfterRemove <- databaseUse(fixture)(connection => PhotoMemoryTable.listByPhotoId(connection, adoption.photoId))
        _ <- IO(assertEquals(memoriesAfterRemove.map(_.contributionId), List(text.id)))
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, text.id).plan(connection))
        photoAfterWithdraw <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(photoAfterWithdraw, None, "最后一条讲述被撤回时删除采用新建的照片，避免孤儿"))
        _ <- IO(assertEquals(sharedKeys.map(key => Files.exists(fixture.dataDir.resolve(key))), List(false, false, false)))
        seededPhoto = exhibition.photos.head
        seededKeys = List(
          seededPhoto.storageKey,
          seededPhoto.thumbKey,
          PhotoStorage.displayKey(exhibition.id, seededPhoto.id)
        )
        _ <- IO(assert(seededKeys.forall(key => Files.isRegularFile(fixture.dataDir.resolve(key)))))
        _ <- databaseUse(fixture)(connection => DeletePhotoMessage(owner, seededPhoto.id).plan(connection))
        deletedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, seededPhoto.id))
        _ <- IO(assertEquals(deletedPhoto, None))
        _ <- IO(assertEquals(seededKeys.map(key => Files.exists(fixture.dataDir.resolve(key))), List(false, false, false), "DeletePhoto 物理删除清理文件"))
        publishExhibition <- seedExhibition(fixture, owner, "归档删除展", photoCount = 3)
        _ <- databaseUse(fixture)(connection => PublishExhibitionMessage(owner, publishExhibition.id).plan(connection))
        archivedTarget = publishExhibition.photos.head
        archivedKeys = List(
          archivedTarget.storageKey,
          archivedTarget.thumbKey,
          PhotoStorage.displayKey(publishExhibition.id, archivedTarget.id)
        )
        _ <- databaseUse(fixture)(connection => DeletePhotoMessage(owner, archivedTarget.id).plan(connection))
        archivedPhoto <- databaseUse(fixture)(connection =>
                           ExhibitionPhotoTable.findById(connection, archivedTarget.id)
                         )
        _ <- IO(assert(archivedPhoto.flatMap(_.archivedAt).isDefined))
        _ <- IO(assert(archivedKeys.forall(key => Files.isRegularFile(fixture.dataDir.resolve(key))), "归档不删文件"))
      yield ()
      scenario
    }
  }

  test("superseded-only 快照：撤回最后讲述时物理删除照片，不因旧快照归档") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_superseded")
        contributor <- registerUser(fixture, "contributor_superseded")
        exhibition <- seedExhibition(fixture, owner, "旧快照展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "旧快照里的回忆", submit = true)
        adoption <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                     )
        adoptedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        photo = adoptedPhoto.getOrElse(throw new IllegalStateException("采用未创建照片"))
        photoKeys = List(photo.storageKey, photo.thumbKey, PhotoStorage.displayKey(exhibition.id, photo.id))
        _ <- databaseUse(fixture)(connection =>
               ExhibitionPhotoTable.updatePlacement(connection, photo.id, exhibition.id, exhibition.groupId, 3, "")
             )
        runPhotosV1 <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        exhibitionV1 <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- databaseUse(fixture)(connection =>
               val run = succeededRun(owner, exhibition.id, runPhotosV1.map(_.id)).copy(
                 curationVersion = exhibitionV1.map(_.curationVersion).getOrElse(1),
                 createdAt = Instant.now,
                 updatedAt = Instant.now
               )
               SceneRunTable.insert(connection, run) *>
                 ExhibitionTable.setCurrentSceneRun(connection, exhibition.id, run.id, run.updatedAt)
             )
        _ <- databaseUse(fixture)(connection => PublishExhibitionMessage(owner, exhibition.id).plan(connection))
        publicV1 <- databaseUse(fixture)(connection => GetPublishedExhibitionMessage(exhibition.id).plan(connection))
        _ <- IO(assertEquals(publicV1.photos.exists(_.id == photo.id), true, "v1 快照包含新建照片"))
        _ <- databaseUse(fixture)(connection => DeletePhotoMessage(owner, photo.id).plan(connection))
        archived <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, photo.id))
        _ <- IO(assert(archived.flatMap(_.archivedAt).isDefined, "active v1 引用时归档"))
        draftPhotosV2 <- databaseUse(fixture)(connection =>
                           ExhibitionPhotoTable.listByExhibition(connection, exhibition.id).map(_.filter(_.archivedAt.isEmpty))
                         )
        exhibitionV2 <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- databaseUse(fixture)(connection =>
               val run = succeededRun(owner, exhibition.id, draftPhotosV2.map(_.id)).copy(
                 curationVersion = exhibitionV2.map(_.curationVersion).getOrElse(1),
                 createdAt = Instant.now.plusSeconds(2),
                 updatedAt = Instant.now.plusSeconds(2)
               )
               SceneRunTable.insert(connection, run) *>
                 ExhibitionTable.setCurrentSceneRun(connection, exhibition.id, run.id, run.updatedAt)
             )
        _ <- databaseUse(fixture)(connection => PublishExhibitionMessage(owner, exhibition.id).plan(connection))
        publicV2 <- databaseUse(fixture)(connection => GetPublishedExhibitionMessage(exhibition.id).plan(connection))
        _ <- IO(assertEquals(publicV2.photos.exists(_.id == photo.id), false, "v2 active 快照不含该照片，v1 已 superseded"))
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, submitted.id).plan(connection))
        removed <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, photo.id))
        _ <- IO(assertEquals(removed, None, "superseded-only 引用不阻止物理删除"))
        _ <- IO(assertEquals(photoKeys.map(key => Files.exists(fixture.dataDir.resolve(key))), List(false, false, false)))
      yield ()
      scenario
    }
  }

  test("历史归属回填：adopted_from_contribution_id 为空时按时间戳回填，重复执行幂等且清理恢复") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_backfill")
        contributor <- registerUser(fixture, "contributor_backfill")
        exhibition <- seedExhibition(fixture, owner, "回填展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "回填回忆", submit = true)
        adoption <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                     )
        _ <- databaseUse(fixture)(connection =>
               Sql.update(
                 connection,
                 "UPDATE gallery.exhibition_photos SET adopted_from_contribution_id = NULL WHERE id = ?",
                 List(SqlValue.Uuid(adoption.photoId.value))
               )
             )
        legacy <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(legacy.flatMap(_.adoptedFromContributionId), None, "模拟旧数据"))
        _ <- databaseUse(fixture)(connection => AdoptedPhotoBackfill.backfill(connection))
        _ <- databaseUse(fixture)(connection => AdoptedPhotoBackfill.backfill(connection))
        backfilled <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(backfilled.flatMap(_.adoptedFromContributionId), Some(submitted.id), "按 created_at 回填归属"))
        _ <- databaseUse(fixture)(connection => RemoveMemoryMessage(owner, adoption.photoId, adoption.memoryId).plan(connection))
        removed <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(removed, None, "回填后按显式归属清理照片"))
      yield ()
      scenario
    }
  }

  test("已撤回重复调用：先补清理遗留 adoption，再幂等返回") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_legacy_withdraw")
        contributor <- registerUser(fixture, "contributor_legacy_withdraw")
        exhibition <- seedExhibition(fixture, owner, "遗留撤回展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        submitted <- updateContribution(fixture, contributor, uploaded.id, "旧版本残留", submit = true)
        adoption <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
                     )
        _ <- databaseUse(fixture)(connection =>
               Sql.update(
                 connection,
                 "UPDATE gallery.contributions SET status = 'withdrawn', withdrawn_at = now() WHERE id = ?",
                 List(SqlValue.Uuid(submitted.id.value))
               )
             )
        _ <- databaseUse(fixture)(connection => WithdrawContributionMessage(contributor, submitted.id).plan(connection))
        cleaned <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adoption.photoId))
        _ <- IO(assertEquals(cleaned, None, "已撤回后再次调用补清理遗留 adoption"))
        memories <- databaseUse(fixture)(connection => PhotoMemoryTable.findByContributionId(connection, submitted.id))
        _ <- IO(assertEquals(memories, None))
        repeat <- attempt(
                    databaseUse(fixture)(connection =>
                      WithdrawContributionMessage(contributor, submitted.id).plan(connection)
                    )
                  )
        _ <- IO(assertEquals(repeat.isRight, true, "重复撤回幂等"))
      yield ()
      scenario
    }
  }

  test("v1.15 待处理投稿数：草稿不计、提交计、采用清零、采用后新版本再计；列表与详情同口径") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_pending")
        contributor <- registerUser(fixture, "contributor_pending")
        exhibition <- seedExhibition(fixture, owner, "待处理展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        initial <- pendingCounts(fixture, owner, exhibition.id)
        _ <- IO(assertEquals(initial, (0, 0), "没有投稿时为 0"))
        uploaded <- uploadOne(fixture, contributor, exhibition.id)
        draftCounts <- pendingCounts(fixture, owner, exhibition.id)
        _ <- IO(assertEquals(draftCounts, (0, 0), "draft 投稿不计入待处理"))
        submitted <- updateContribution(fixture, contributor, uploaded.id, "第一版回忆", submit = true)
        submittedCounts <- pendingCounts(fixture, owner, exhibition.id)
        _ <- IO(assertEquals(submittedCounts, (1, 1), "已提交且未采用计入"))
        _ <- databaseUse(fixture)(connection =>
               AdoptContributionMessage(owner, submitted.id, submitted.version, None, None).plan(connection)
             )
        adoptedCounts <- pendingCounts(fixture, owner, exhibition.id)
        _ <- IO(assertEquals(adoptedCounts, (0, 0), "采用后清零"))
        _ <- updateContribution(fixture, contributor, uploaded.id, "第二版回忆", submit = true)
        updatedCounts <- pendingCounts(fixture, owner, exhibition.id)
        _ <- IO(assertEquals(updatedCounts, (1, 1), "已采用后的新版本再次计入"))
      yield ()
      scenario
    }
  }

  test("v1.15 采用时放入章节：新照片落在章节末尾；缺省仍未分组；章节不属于本展览 404 且不留副作用；原地更新忽略 groupId") {
    withFixture { fixture =>
      val scenario = for
        owner <- registerUser(fixture, "owner_adopt_group")
        contributor <- registerUser(fixture, "contributor_adopt_group")
        exhibition <- seedExhibition(fixture, owner, "放章节展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        first <- uploadOne(fixture, contributor, exhibition.id)
        firstSubmitted <- updateContribution(fixture, contributor, first.id, "放进章节", submit = true)
        unknownGroup <- attempt(
                          databaseUse(fixture)(connection =>
                            AdoptContributionMessage(
                              owner,
                              firstSubmitted.id,
                              firstSubmitted.version,
                              None,
                              None,
                              Some(GroupId(UUID.randomUUID()))
                            ).plan(connection)
                          )
                        )
        _ <- IO(assertEquals(unknownGroup.left.toOption.map(_.error.code), Some(ErrorCode.NotFound)))
        photosAfterFailure <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        _ <- IO(assertEquals(photosAfterFailure.size, 3, "章节不存在时不应创建照片"))
        adopted <- databaseUse(fixture)(connection =>
                     AdoptContributionMessage(
                       owner,
                       firstSubmitted.id,
                       firstSubmitted.version,
                       None,
                       None,
                       Some(exhibition.groupId)
                     ).plan(connection)
                   )
        placed <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, adopted.photoId))
        _ <- IO(assertEquals(placed.flatMap(_.groupId), Some(exhibition.groupId)))
        _ <- IO(
               assertEquals(
                 placed.flatMap(_.positionInGroup),
                 Some(exhibition.photos.flatMap(_.positionInGroup).max + 1),
                 "放在章节末尾"
               )
             )
        second <- uploadOne(fixture, contributor, exhibition.id)
        secondSubmitted <- updateContribution(fixture, contributor, second.id, "不指定章节", submit = true)
        ungrouped <- databaseUse(fixture)(connection =>
                       AdoptContributionMessage(owner, secondSubmitted.id, secondSubmitted.version, None, None).plan(connection)
                     )
        ungroupedPhoto <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, ungrouped.photoId))
        _ <- IO(assertEquals(ungroupedPhoto.flatMap(_.groupId), None, "缺省保持旧行为：未分组"))
        newerVersion <- updateContribution(fixture, contributor, first.id, "第二版", submit = true)
        updatedInPlace <- databaseUse(fixture)(connection =>
                            AdoptContributionMessage(
                              owner,
                              newerVersion.id,
                              newerVersion.version,
                              None,
                              None,
                              Some(GroupId(UUID.randomUUID()))
                            ).plan(connection)
                          )
        stillPlaced <- databaseUse(fixture)(connection => ExhibitionPhotoTable.findById(connection, updatedInPlace.photoId))
        _ <- IO(assertEquals(stillPlaced.flatMap(_.groupId), Some(exhibition.groupId), "原地更新不移动照片、不校验 groupId"))
      yield ()
      scenario
    }
  }

  test("v1.16 投稿去向：未发布两项为 false；发布后已采用讲述为已公开；发布后才采用的不算；采用后新版本不改变旧版本的公开状态") {
    withFixture { fixture =>
      def listed(contributor: UserId): IO[List[ContributionSummary]] =
        databaseUse(fixture)(connection => ListContributionsMessage(contributor, None).plan(connection)).map(_.contributions)

      val scenario = for
        owner <- registerUser(fixture, "owner_destination")
        contributor <- registerUser(fixture, "contributor_destination")
        exhibition <- seedExhibition(fixture, owner, "去向展", photoCount = 3)
        _ <- joinAndSubmitUser(fixture, owner, contributor, exhibition.id)
        first <- uploadOne(fixture, contributor, exhibition.id)
        firstSubmitted <- updateContribution(fixture, contributor, first.id, "发布前采用的回忆", submit = true)
        beforeAdopt <- listed(contributor)
        _ <- IO(assertEquals(beforeAdopt.map(c => (c.exhibitionPublished, c.memoryPublished)), List((false, false))))
        _ <- databaseUse(fixture)(connection =>
               AdoptContributionMessage(owner, firstSubmitted.id, firstSubmitted.version, None, None, Some(exhibition.groupId))
                 .plan(connection)
             )
        adoptedUnpublished <- listed(contributor)
        _ <- IO(assertEquals(adoptedUnpublished.map(c => (c.exhibitionPublished, c.memoryPublished)), List((false, false)), "展览未发布时采用也不算公开"))
        runPhotos <- databaseUse(fixture)(connection => ExhibitionPhotoTable.listByExhibition(connection, exhibition.id))
        exhibitionRow <- databaseUse(fixture)(connection => ExhibitionTable.findById(connection, exhibition.id))
        _ <- databaseUse(fixture)(connection =>
               val run = succeededRun(owner, exhibition.id, runPhotos.map(_.id)).copy(
                 curationVersion = exhibitionRow.map(_.curationVersion).getOrElse(1),
                 createdAt = Instant.now,
                 updatedAt = Instant.now
               )
               SceneRunTable.insert(connection, run) *>
                 ExhibitionTable.setCurrentSceneRun(connection, exhibition.id, run.id, run.updatedAt)
             )
        _ <- databaseUse(fixture)(connection => PublishExhibitionMessage(owner, exhibition.id).plan(connection))
        published <- listed(contributor)
        _ <- IO(assertEquals(published.map(c => (c.exhibitionPublished, c.memoryPublished)), List((true, true)), "发布后已采用讲述已公开"))

        second <- uploadOne(fixture, contributor, exhibition.id)
        secondSubmitted <- updateContribution(fixture, contributor, second.id, "发布后才采用的回忆", submit = true)
        _ <- databaseUse(fixture)(connection =>
               AdoptContributionMessage(owner, secondSubmitted.id, secondSubmitted.version, None, None, Some(exhibition.groupId))
                 .plan(connection)
             )
        _ <- updateContribution(fixture, contributor, first.id, "第一条的第二版", submit = true)
        afterPublish <- listed(contributor)
        byText = afterPublish.map(c => c.id -> c).toMap
        _ <- IO(assertEquals(byText(secondSubmitted.id).exhibitionPublished, true))
        _ <- IO(assertEquals(byText(secondSubmitted.id).memoryPublished, false, "采用发生在发布之后：下次发布前不算公开"))
        _ <- IO(assertEquals(byText(firstSubmitted.id).hasPendingUpdate, true))
        _ <- IO(assertEquals(byText(firstSubmitted.id).memoryPublished, true, "新版本待确认期间，旧版本的公开状态不变"))

        reviewed <- databaseUse(fixture)(connection => ListContributionsMessage(owner, Some(exhibition.id)).plan(connection))
        _ <- IO(
               assertEquals(
                 reviewed.contributions.find(_.id == firstSubmitted.id).map(c => (c.exhibitionPublished, c.memoryPublished)),
                 Some((true, true)),
                 "创建者审阅列表同口径"
               )
             )
      yield ()
      scenario
    }
  }

  // ===== 测试夹具 =====

  /** (详情里的待处理数, 列表里该展览的待处理数)：两个出口必须同口径。 */
  private def pendingCounts(fixture: Fixture, owner: UserId, exhibitionId: ExhibitionId): IO[(Int, Int)] =
    for
      detail <- databaseUse(fixture)(connection => GetExhibitionMessage(owner, exhibitionId).plan(connection))
      list <- databaseUse(fixture)(connection => ListMyExhibitionsMessage(owner).plan(connection))
    yield (
      detail.pendingContributionCount,
      list.exhibitions.find(_.id == exhibitionId).map(_.pendingContributionCount).getOrElse(-1)
    )

  private final case class Fixture(
    database: Database,
    dataDir: Path,
    config: ContributionConfig,
    tempDir: Path,
    counter: java.util.concurrent.atomic.AtomicInteger,
    createdUsers: cats.effect.Ref[IO, List[UserId]],
    createdExhibitions: cats.effect.Ref[IO, List[ExhibitionId]]
  )

  private final case class SeededExhibition(id: ExhibitionId, groupId: GroupId, photos: List[ExhibitionPhoto])

  private def withFixture(body: Fixture => IO[Unit]): Unit =
    (for
      dotEnv <- DotEnv.load(Path.of(".env"))
      appConfig <- IO.fromEither(AppConfig.load(dotEnv ++ sys.env).left.map(message => new IllegalStateException(message)))
      dataDir <- IO.blocking(Files.createTempDirectory("contribution-spec-"))
      tempDir <- IO.blocking(Files.createTempDirectory("contribution-temp-"))
      createdUsers <- IO.ref(List.empty[UserId])
      createdExhibitions <- IO.ref(List.empty[ExhibitionId])
      _ <- Database.resource(appConfig.database).use { database =>
             val scoped = Fixture(
                            database,
                            dataDir,
                            appConfig.contributions,
                            tempDir,
                            new java.util.concurrent.atomic.AtomicInteger(0),
                            createdUsers,
                            createdExhibitions
                          )
             (initializeTables(database) *>
               AppRuntime.initialize(appConfig.copy(dataDir = dataDir), database) *>
               body(scoped)).guarantee(cleanup(scoped))
           }
      _ <- deleteDirectory(tempDir)
      _ <- deleteDirectory(dataDir)
    yield ()).unsafeRunSync()

  private def initializeTables(database: Database): IO[Unit] =
    val initializers = List(
      UserTableInitializer.initialize,
      SessionTableInitializer.initialize,
      ProfileTableInitializer.initialize,
      PhotoAnalysisTableInitializer.initialize,
      ExhibitionTableInitializer.initialize,
      ExhibitionGroupTableInitializer.initialize,
      ExhibitionPhotoTableInitializer.initialize,
      PhotoLocationTableInitializer.initialize,
      ContributionInviteTableInitializer.initialize,
      ExhibitionContributorTableInitializer.initialize,
      ContributionTableInitializer.initialize,
      PhotoMemoryTableInitializer.initialize,
      PublicationTableInitializer.initialize,
      SceneRunTableInitializer.initialize
    )
    database.use(connection => Transaction(connection)(initializers.traverse_(initialize => initialize(connection))))

  private def databaseUse[A](fixture: Fixture)(action: java.sql.Connection => IO[A]): IO[A] =
    fixture.database.use(action)

  private def registerUser(fixture: Fixture, prefix: String): IO[UserId] =
    val username = s"${prefix.filter(character => character.isLetterOrDigit).take(12)}_${UUID.randomUUID().toString.replace("-", "").take(12)}"
    for
      userId <- databaseUse(fixture)(connection => RegisterMessage(username, password).plan(connection).map(_.user.id))
      _ <- fixture.createdUsers.update(_ :+ userId)
    yield userId

  private def seedExhibition(fixture: Fixture, owner: UserId, title: String, photoCount: Int): IO[SeededExhibition] =
    val exhibitionId = ExhibitionId(UUID.randomUUID())
    val groupId = GroupId(UUID.randomUUID())
    val photos = (1 to photoCount).toList.map(index => photoOf(exhibitionId, groupId, index))
    val run = succeededRun(owner, exhibitionId, photos.map(_.id))
    for
      _ <- databaseUse(fixture) { connection =>
             for
               _ <- ExhibitionTable.insert(connection, exhibitionOf(exhibitionId, owner, title))
               _ <- ExhibitionGroupTable.insert(connection, ExhibitionGroup(groupId, exhibitionId, "章一", "", 0))
               _ <- photos.traverse_(photo => ExhibitionPhotoTable.insert(connection, photo))
               _ <- SceneRunTable.insert(connection, run)
               _ <- ExhibitionTable.setCurrentSceneRun(connection, exhibitionId, run.id, run.updatedAt)
             yield ()
           }
      _ <- photos.traverse_(photo => PhotoStorage.write(fixture.dataDir, photo.storageKey, validJpeg(12, 8, 0x334455)))
      _ <- photos.traverse_(photo => PhotoStorage.write(fixture.dataDir, photo.thumbKey, validJpeg(6, 4, 0x334455)))
      _ <- photos.traverse_(photo => PhotoStorage.write(fixture.dataDir, PhotoStorage.displayKey(exhibitionId, photo.id), validJpeg(6, 4, 0x334455)))
      _ <- fixture.createdExhibitions.update(_ :+ exhibitionId)
    yield SeededExhibition(exhibitionId, groupId, photos)

  private def joinAndSubmitUser(fixture: Fixture, owner: UserId, contributor: UserId, exhibitionId: ExhibitionId): IO[Unit] =
    for
      invite <- databaseUse(fixture)(connection => CreateContributionInviteMessage(owner, exhibitionId).plan(connection))
      _ <- databaseUse(fixture)(connection => JoinContributionMessage(contributor, invite.token).plan(connection))
    yield ()

  private def uploadOne(fixture: Fixture, contributor: UserId, exhibitionId: ExhibitionId): IO[ContributionSummary] =
    for
      files <- prepareCandidates(fixture, List(validJpeg(16, 12, 0x884422)))
      response <- databaseUse(fixture) { connection =>
                    ContributionUploadMessage(contributor, exhibitionId, None, fixture.dataDir, files, fixture.config)
                      .plan(connection)
                  }
      summary <- response.contributions.headOption match
                   case Some(found) => IO.pure(found)
                   case None => IO.raiseError(new IllegalStateException("上传未创建投稿"))
    yield summary

  private def createTextContribution(
    fixture: Fixture,
    contributor: UserId,
    exhibitionId: ExhibitionId,
    memoryText: String,
    suggestedCaption: Option[String] = None
  ): IO[ContributionSummary] =
    databaseUse(fixture)(connection =>
      CreateContributionMessage(contributor, exhibitionId, memoryText, suggestedCaption, None).plan(connection)
    )

  private def updateContribution(
    fixture: Fixture,
    contributor: UserId,
    contributionId: ContributionId,
    memoryText: String,
    submit: Boolean,
    removePhoto: Boolean = false,
    location: Option[ContributionLocationInput] = None,
    suggestedCaption: Option[String] = None
  ): IO[ContributionSummary] =
    databaseUse(fixture)(connection =>
      UpdateContributionMessage(
        contributor,
        contributionId,
        memoryText,
        suggestedCaption,
        location,
        submit,
        removePhoto
      ).plan(connection)
    )

  private def prepareCandidates(fixture: Fixture, fileBytes: List[Array[Byte]]): IO[List[UploadCandidate]] =
    fileBytes.zipWithIndex.traverse { case (bytes, index) =>
      val path = fixture.tempDir.resolve(s"file-${fixture.counter.incrementAndGet()}-$index.bin")
      IO.blocking(Files.write(path, bytes)).as(UploadCandidate(s"upload-$index.jpg", Some("image/jpeg"), path))
    }

  private def attempt[A](action: IO[A]): IO[Either[ApiException, A]] =
    action.attempt.map {
      case Left(exception: ApiException) => Left(exception)
      case Left(other) => throw other
      case Right(value) => Right(value)
    }

  private def reasonOf(exception: ApiException): Option[String] =
    exception.error.details.flatMap(_.apply("reason")).flatMap(_.asString)

  private def cleanup(fixture: Fixture): IO[Unit] =
    (for
      users <- fixture.createdUsers.get
      exhibitionIds <- fixture.createdExhibitions.get
      _ <- fixture.database
             .use { connection =>
               for
                 _ <- users.traverse_(userId => services.users.tables.SessionTable.deleteByUserId(connection, userId))
                 _ <- exhibitionIds.traverse_(id =>
                        services.system.db.Sql.update(
                          connection,
                          "DELETE FROM scene.scene_runs WHERE exhibition_id = ?",
                          List(services.system.db.SqlValue.Uuid(id.value))
                        )
                      )
                 _ <- exhibitionIds.traverse_(id =>
                        services.system.db.Sql.update(
                          connection,
                          "DELETE FROM gallery.exhibitions WHERE id = ?",
                          List(services.system.db.SqlValue.Uuid(id.value))
                        )
                      )
                 _ <- users.traverse_(userId =>
                        services.system.db.Sql.update(
                          connection,
                          "DELETE FROM users.users WHERE id = ?",
                          List(services.system.db.SqlValue.Uuid(userId.value))
                        )
                      )
               yield ()
             }
    yield ()).attempt.void

  private def exhibitionOf(id: ExhibitionId, owner: UserId, title: String): Exhibition =
    Exhibition(
      id = id,
      ownerId = owner,
      title = title,
      narrative = "",
      curationVersion = 1,
      coverKind = CoverKind.Auto,
      coverPhotoId = None,
      coverStorageKey = None,
      coverMime = None,
      coverWidth = None,
      coverHeight = None,
      createdAt = t0,
      updatedAt = t0
    )

  private def photoOf(exhibitionId: ExhibitionId, groupId: GroupId, index: Int): ExhibitionPhoto =
    ExhibitionPhoto(
      id = PhotoId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      storageKey = s"${exhibitionId.value}/photo-$index.jpg",
      thumbKey = s"${exhibitionId.value}/photo-$index.thumb.jpg",
      originalName = s"photo-$index.jpg",
      mime = "image/jpeg",
      width = Some(12),
      height = Some(8),
      groupId = Some(groupId),
      positionInGroup = Some(index),
      caption = "",
      archivedAt = None,
      createdAt = t0
    )

  private def succeededRun(owner: UserId, exhibitionId: ExhibitionId, photoIds: List[PhotoId]): SceneRun =
    services.scene.objects.SceneRun(
      id = services.scene.objects.SceneRunId(UUID.randomUUID()),
      exhibitionId = exhibitionId,
      requestedBy = owner,
      status = services.scene.objects.SceneRunStatus.Succeeded,
      source = Some(services.scene.objects.SceneSource.Ai),
      hint = None,
      photoIds = photoIds,
      curationVersion = 1,
      runtimeVersion = "1",
      brief = Some(
        services.scene.objects.SceneBrief("安静的眷恋", "海边的光。", "题面", "导语", List("#0B1020"), Nil, None)
      ),
      code = Some("function build(ctx) {}"),
      review = None,
      runtimeEvidence = None,
      attempts = 0,
      promptVersion = "scene-parent-v1",
      errorCode = None,
      errorMessage = None,
      createdAt = t0,
      updatedAt = t0
    )

  private def validJpeg(width: Int, height: Int, rgb: Int): Array[Byte] =
    val image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
    val graphics = image.createGraphics()
    graphics.setColor(new java.awt.Color(rgb))
    graphics.fillRect(0, 0, width, height)
    graphics.dispose()
    val output = new ByteArrayOutputStream()
    ImageIO.write(image, "jpg", output)
    output.toByteArray

  private def deleteDirectory(directory: Path): IO[Unit] =
    IO.blocking {
      import scala.jdk.CollectionConverters.*
      val paths = Files.walk(directory)
      val entries = paths.iterator().asScala.toList.reverse
      paths.close()
      entries.foreach(Files.deleteIfExists)
    }
