package services.scene

import java.time.Instant
import java.util.UUID

import cats.effect.IO
import munit.CatsEffectSuite

import services.gallery.objects.*
import services.gallery.tables.PhotoMemoryTable
import services.scene.utils.SceneState
import services.users.objects.UserId

/** SceneState.load 读取已采用的讲述（WT-06）：清洗成摘录、按照片归属、不含署名；没有讲述的照片不出现。 */
class SceneStateMemoriesSpec extends CatsEffectSuite with SceneTestSupport:

  private def memory(photoId: PhotoId, text: String, name: String): PhotoMemory =
    PhotoMemory(
      id = PhotoMemoryId(UUID.randomUUID()),
      photoId = photoId,
      contributionId = ContributionId(UUID.randomUUID()),
      contributorUserId = UserId(UUID.randomUUID()),
      contributorName = name,
      text = text,
      adoptedVersion = 1,
      createdAt = Instant.parse("2026-11-05T01:00:00Z"),
      updatedAt = Instant.parse("2026-11-05T01:00:00Z")
    )

  test("加载场景状态时带上已采用的讲述摘录：换行折叠、不含署名，没有讲述的照片不出现") {
    withDatabase { (_, connection, _) =>
      for
        (userId, exhibitionId, photos) <- seedExhibition(connection)
        exhibition <- services.gallery.tables.ExhibitionTable.findById(connection, exhibitionId).map(_.get)
        _ <- PhotoMemoryTable.insert(connection, memory(photos.head.id, "海风很大\n谁也没说话", "海风小姐"))
        _ <- PhotoMemoryTable.insert(connection, memory(photos(1).id, "第二张的回忆", "海风小姐"))
        state <- SceneState.load(connection, exhibition)
        _ <- IO(assertEquals(state.memories.get(photos.head.id), Some(List("海风很大 谁也没说话"))))
        _ <- IO(assertEquals(state.memories.get(photos(1).id), Some(List("第二张的回忆"))))
        _ <- IO(assertEquals(state.memories.get(photos(2).id), None, "没有讲述的照片不带摘录"))
        _ <- IO(assert(!state.memories.values.flatten.exists(_.contains("海风小姐")), "摘录不含投稿者署名"))
        _ <- cleanup(connection, exhibitionId)
      yield ()
    }
  }
