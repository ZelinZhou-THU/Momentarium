package services.scene

import java.time.Instant
import java.util.UUID

import munit.FunSuite

import services.gallery.objects.*
import services.scene.objects.SceneBrief
import services.scene.utils.{BriefValidation, CodeSanitizer, SceneState}
import services.scene.utils.prompts.{ReferenceSnippetLibrary, ReferenceSnippets, SceneBriefPrompts, SceneCodePrompts}
import services.users.objects.UserId

/**
 * 参考片段库与示例题面：片段能从资源加载、每段都守沙箱契约、按题面挑选（负面约束段不参与），
 * 示例题面按照片内容换场所且每个都通过题面校验。片段的渲染效果在 prototypes/three/design-refs/snippets.html 里看。
 */
class ReferenceSnippetsSpec extends FunSuite:

  private val now = Instant.parse("2026-10-29T12:00:00Z")

  private def library: ReferenceSnippetLibrary =
    ReferenceSnippets.library.fold(reason => fail(s"参考片段库加载失败：$reason"), identity)

  private def brief(scene: String, mood: String = "安静的眷恋"): SceneBrief =
    SceneBrief(
      mood = mood,
      memoryReading = "",
      scenePrompt = s"【任务】做一个场景。【场景与空间】$scene【技术与性能】可读水面；不得联网。【避免】水面纯色无纹理；盒子+三角屋顶的简陋建筑；随机球体堆叠。",
      entranceNarration = "",
      palette = Nil,
      avoid = Nil,
      userHint = None
    )

  private def state(captions: List[String]): SceneState =
    val exhibitionId = ExhibitionId(UUID.fromString("00000000-0000-0000-0000-000000005001"))
    val groupId = GroupId(UUID.fromString("00000000-0000-0000-0000-000000005002"))
    val exhibition = Exhibition(exhibitionId, UserId(UUID.fromString("00000000-0000-0000-0000-000000005003")), "三天", "", 1, CoverKind.Auto, None, None, None, None, None, now, now)
    val photos = captions.zipWithIndex.map { case (caption, index) =>
      ExhibitionPhoto(PhotoId(UUID.randomUUID()), exhibitionId, s"ex/$index.jpg", s"ex/$index.thumb.jpg", s"$index.jpg", "image/jpeg", Some(1024), Some(683), Some(groupId), Some(index), caption, None, now)
    }
    SceneState(exhibition, List(ExhibitionGroup(groupId, exhibitionId, "第一章", "", 0)), photos)

  test("片段库从资源加载：toolkit + 9 段，每段都有关键词以外的可读源码") {
    val loaded = library
    assertEquals(loaded.toolkit.id, "toolkit")
    assertEquals(
      loaded.snippets.map(_.id),
      List("water", "lighthouse", "cottage", "wet-street", "street-building", "street-lamp", "interior-light", "terrain", "trees")
    )
    (loaded.toolkit :: loaded.snippets).foreach(snippet => assert(snippet.source.contains("function "), s"${snippet.id} 应定义辅助函数"))
  }

  test("每段片段都守沙箱契约：拼进 build(ctx) 后过基础校验，不碰网络/DOM/照片纹理/eval") {
    val forbidden = List("fetch(", "XMLHttpRequest", "WebSocket", "import ", "Worker(", "eval(", "new Function", "document.", "ctx.photos", "Math.random")
    val loaded = library
    (loaded.toolkit :: loaded.snippets).foreach { snippet =>
      val wrapped = s"function build(ctx) {\n  const THREE = ctx.THREE, scene = ctx.scene;\n${snippet.source}\n}"
      assert(CodeSanitizer.sanitize(wrapped, 60).isRight, s"${snippet.id} 拼装后未通过 CodeSanitizer")
      forbidden.foreach(token => assert(!snippet.source.contains(token), s"${snippet.id} 含禁用写法：$token"))
    }
  }

  test("按题面挑片段：雨夜街道选湿街和街角建筑，室内选室内光，海岸选水面") {
    val loaded = library
    val rainy = ReferenceSnippets.select(loaded, ReferenceSnippets.sceneText(brief("雨夜的城市街角，霓虹招牌和路灯照在湿漉漉的路面上。")))
    assert(rainy.map(_.id).contains("wet-street"), rainy.map(_.id).toString)
    assert(rainy.map(_.id).contains("street-building"), rainy.map(_.id).toString)
    val interior = ReferenceSnippets.select(loaded, ReferenceSnippets.sceneText(brief("室内展厅，天窗落下一束光束，尘粒漂浮。")))
    assertEquals(interior.headOption.map(_.id), Some("interior-light"))
    val coast = ReferenceSnippets.select(loaded, ReferenceSnippets.sceneText(brief("黄昏的海岸，礁石边立着一座灯塔，潮水拍岸。")))
    assert(coast.map(_.id).contains("water") && coast.map(_.id).contains("lighthouse"), coast.map(_.id).toString)
    assert(rainy.size <= ReferenceSnippets.MaxSelected && coast.size <= ReferenceSnippets.MaxSelected)
  }

  test("【避免】【技术与性能】里的固定负面词不参与挑选；都不命中时给默认组合") {
    val text = ReferenceSnippets.sceneText(brief("一片空旷的抽象空间。", mood = "平静"))
    assert(!text.contains("水面纯色"), "负面约束段应被去掉")
    assertEquals(ReferenceSnippets.select(library, text).map(_.id), ReferenceSnippets.DefaultIds)
  }

  test("子代码提示词嵌入 toolkit 与挑中的片段，并写明复制与咬合规则") {
    val prompt = SceneCodePrompts.generateSceneCode("run-snippets", brief("雨夜的城市街角，霓虹灯下的湿街。"), state(List("雨夜")), 60).instructions
    assert(prompt.contains("function makeDataTexture"), "toolkit 必须总是附带")
    assert(prompt.contains("function makeWetStreet"), "雨夜题面应附带湿街片段")
    assert(!prompt.contains("function makeLighthouse"), "不相关片段不应附带")
    assert(prompt.contains("原样复制") && prompt.contains("咬合"))
  }

  test("修订按评审意见补片段：点名树时补 trees（含它缺的 toolkit 函数），上一版已有的片段不重复给") {
    val loaded = library
    val treeIssue = List("composition｜首屏中部偏左，正对圆门｜正对圆门轴线的树干与树冠挡住门洞和右侧窗，把这棵树移到门侧后方")
    val fromScratch = ReferenceSnippets.selectForRepair(loaded, treeIssue, "function build(ctx) { const THREE = ctx.THREE; }")
    assertEquals(fromScratch.map(_.id), List("toolkit", "trees"))
    val treesSource = loaded.snippets.find(_.id == "trees").map(_.source).getOrElse(fail("缺少 trees 片段"))
    val alreadyHasTrees = List("function build(ctx) {", loaded.toolkit.source, treesSource, "}").mkString("\n")
    assertEquals(ReferenceSnippets.selectForRepair(loaded, treeIssue, alreadyHasTrees), Nil)
    assertEquals(ReferenceSnippets.selectForRepair(loaded, List("lightingColor｜画面整体｜主光调成暖橙"), ""), Nil)
  }

  test("修订提示词：带修订方式（不改未点名部分）与按意见补充的片段；无需补片段时不出现片段段落") {
    val treeIssue = List("completeness｜右侧大树｜树冠是尖刺三角片，按阔叶树重做")
    val withTrees = SceneCodePrompts.repairSceneCode("run-repair", brief("山坡上的小屋"), state(List("绿坡")), "function build(ctx) {}", treeIssue, 60).instructions
    assert(withTrees.contains("评审没点名的构件"), "修订提示词应要求保留未点名的部分")
    assert(withTrees.contains("function makeBroadleafTree"), "点名树时应附带阔叶树片段")
    val lightOnly = SceneCodePrompts.repairSceneCode("run-repair", brief("山坡上的小屋"), state(List("绿坡")), "function build(ctx) {}", List("lightingColor｜画面整体｜主光调成暖橙"), 60).instructions
    assert(!lightOnly.contains("【参考片段"), "评审没点名片段覆盖的元素时不应附带片段")
  }

  test("示例题面按照片内容换场所，每个场所的示例都通过题面校验") {
    val cases = List(
      List("退潮后的礁石", "海边的灯塔") -> "coast",
      List("雨夜的街角", "霓虹下的小巷") -> "rainy-street",
      List("窗边的书桌", "房间里的午后") -> "interior",
      List("山间的湖", "清晨的树林") -> "mountain",
      List("一些说不清的瞬间") -> "mountain"
    )
    cases.foreach { case (captions, expected) =>
      val photosState = state(captions)
      assertEquals(SceneBriefPrompts.exampleSceneId(photosState, Map.empty, None), expected, captions.toString)
      val example = SceneBriefPrompts.writeBrief("run-example", photosState, Map.empty, None, 60).responseExample.as[SceneBrief]
      example.fold(error => fail(error.getMessage), decoded => assertEquals(BriefValidation.validate(decoded), Nil, s"$expected 示例未通过校验"))
    }
  }
