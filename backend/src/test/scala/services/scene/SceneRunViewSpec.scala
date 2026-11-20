package services.scene

import java.time.Instant
import java.util.UUID

import io.circe.Json
import io.circe.syntax.*

import munit.FunSuite

import services.gallery.objects.{ExhibitionId, PhotoId}
import services.scene.objects.*
import services.scene.objects.apiTypes.SceneRunView

/** SceneRunView 的 wire 形状：枚举小写、Option 序列化为 null、与 api-contract §4.1 对齐。 */
class SceneRunViewSpec extends FunSuite:

  private val createdAt = Instant.parse("2026-10-27T11:58:30Z")
  private val updatedAt = Instant.parse("2026-10-27T12:00:00Z")

  private val emptyView = SceneRunView(
    runId = SceneRunId(UUID.fromString("00000000-0000-0000-0000-000000000001")),
    exhibitionId = ExhibitionId(UUID.fromString("00000000-0000-0000-0000-000000000002")),
    status = SceneRunStatus.AwaitingCapture,
    source = None,
    attempts = 0,
    hint = None,
    photoIds = List(PhotoId(UUID.fromString("00000000-0000-0000-0000-000000000003"))),
    curationVersion = 0,
    brief = None,
    code = None,
    review = None,
    errorCode = None,
    errorMessage = None,
    createdAt = createdAt,
    updatedAt = updatedAt
  )

  test("SceneRunView 空字段编码：枚举小写、Option 全部序列化为 null，kind 默认 generate、isCurrent=false") {
    val json = emptyView.asJson
    assertEquals(json.hcursor.get[String]("status").toOption, Some("awaiting_capture"))
    assertEquals(json.hcursor.get[String]("runId").toOption, Some("00000000-0000-0000-0000-000000000001"))
    assertEquals(json.hcursor.get[String]("exhibitionId").toOption, Some("00000000-0000-0000-0000-000000000002"))
    List("source", "hint", "brief", "code", "review", "errorCode", "errorMessage", "parentRunId", "revisionInstruction")
      .foreach { field =>
        assertEquals(json.hcursor.downField(field).focus, Some(Json.Null), s"$field 必须显式序列化为 null")
      }
    assertEquals(json.hcursor.get[String]("kind").toOption, Some("generate"))
    assertEquals(json.hcursor.get[Boolean]("isCurrent").toOption, Some(false))
    assertEquals(json.hcursor.get[String]("createdAt").toOption, Some("2026-10-27T11:58:30Z"))
  }

  test("SceneRunView 修订运行：kind=revise、parentRunId/revisionInstruction/isCurrent 按契约序列化并往返") {
    val parentId = SceneRunId(java.util.UUID.fromString("00000000-0000-0000-0000-000000000009"))
    val revised = emptyView.copy(
      kind = SceneRunKind.Revise,
      parentRunId = Some(parentId),
      revisionInstruction = Some("把灯塔调亮"),
      isCurrent = false
    )
    val json = revised.asJson
    assertEquals(json.hcursor.get[String]("kind").toOption, Some("revise"))
    assertEquals(json.hcursor.get[String]("parentRunId").toOption, Some(parentId.value.toString))
    assertEquals(json.hcursor.get[String]("revisionInstruction").toOption, Some("把灯塔调亮"))
    assertEquals(json.hcursor.get[Boolean]("isCurrent").toOption, Some(false))
    assertEquals(json.as[SceneRunView], Right(revised))
  }

  test("SceneRunView 编码后可无损解码（含 brief/review 与 source=ai）") {
    val populated = emptyView.copy(
      status = SceneRunStatus.Succeeded,
      source = Some(SceneSource.Ai),
      attempts = 1,
      hint = Some("想要更安静一点"),
      curationVersion = 3,
      brief = Some(
        SceneBrief(
          mood = "安静的眷恋",
          memoryReading = "海风与退潮的礁石唤起克制的想念。",
          scenePrompt = "【任务】用 Three.js 生成一个可沉浸游览的三维记忆场景……",
          entranceNarration = "沿着潮声走进那片黄昏。",
          palette = List("#1B2A4A", "#F2A65A"),
          avoid = List("空场景", "过曝"),
          userHint = Some("想要更安静一点")
        )
      ),
      code = Some("function build(ctx) { return ctx; }"),
      review = Some(SceneReview(RubricScores(4, 4, 4, 4, 4), ReviewVerdict.Pass, Nil, "通过")),
      updatedAt = updatedAt
    )
    assertEquals(populated.asJson.as[SceneRunView], Right(populated))
    assertEquals(populated.asJson.hcursor.get[String]("source").toOption, Some("ai"))
    assertEquals(populated.asJson.hcursor.get[String]("status").toOption, Some("succeeded"))
  }
