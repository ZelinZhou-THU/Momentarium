package services.scene.utils.prompts

import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import io.circe.parser.decode

import services.scene.objects.SceneBrief
import services.system.assets.BundledResource

/** 一段手写参考片段（可读的辅助函数源码 + 题面关键词）。 */
private[scene] final case class ReferenceSnippet(id: String, title: String, keywords: List[String], source: String)

/** 参考片段库：toolkit 每次都带，其余按题面挑选。 */
private[scene] final case class ReferenceSnippetLibrary(toolkit: ReferenceSnippet, snippets: List[ReferenceSnippet])

/**
 * 子代码提示词的 few-shot 素材（2026-10-29 起取代 GoldenReferenceScenes 的两段压缩片段）。
 *
 * 片段源文件只有一份：`backend/src/main/resources/scene/snippets/`（manifest.json + 各 .js），
 * `prototypes/three/design-refs/snippets.html` 评审画廊读的也是这些文件，改片段后在画廊里看渲染效果即可。
 * 资源随 jar 打包、内容固定，类加载时读一次；读不到时保留原因，提示词里明确降级而不是静默丢掉 few-shot。
 *
 * 挑选：只看题面里描述场景的部分（去掉【避免】【技术与性能】——那里固定写着"水面纯色无纹理"之类的负面约束，
 * 会让每个题面都命中水面），按命中关键词数排序，最多 3 段且总量受预算约束；一个都没命中时给通用的地形 + 树 + 小屋。
 *
 * 修订（2026-10-30 起）：修订提示词也带片段，但只按评审意见挑、只给上一版代码里还没有的片段——
 * Auckland live 第三轮评审要求改树，修订提示词里没有任何树的参考，模型自己拼出了尖刺树冠和交叉枝干。
 */
private[scene] object ReferenceSnippets:

  private final case class Entry(id: String, title: String, file: String, keywords: List[String])
  private final case class Manifest(toolkit: Entry, snippets: List[Entry])
  private given Decoder[Entry] = deriveDecoder[Entry]
  private given Decoder[Manifest] = deriveDecoder[Manifest]

  private val ResourceRoot = "scene/snippets/"
  val MaxSelected = 3
  /** 选中片段（不含 toolkit）的总字节预算：约 21KB（地形 + 树 + 小屋刚好放下），加上 toolkit 后 few-shot 段约 26KB。 */
  val SelectedBudgetBytes: Int = 21 * 1024
  val DefaultIds: List[String] = List("terrain", "trees", "cottage")
  /** 修订时最多补几段：修订是改上一版，不是重写，只补评审点名元素对应的片段。 */
  val MaxRepairSelected = 2

  private val FunctionName = """function\s+([A-Za-z_$][\w$]*)\s*\(""".r

  private val NonSceneSections = "(?s)【(避免|技术与性能)】.*?(?=【|$)".r

  lazy val library: Either[String, ReferenceSnippetLibrary] =
    for
      manifestText <- readResource("manifest.json")
      manifest <- decode[Manifest](manifestText).left.map(error => s"manifest.json 解析失败：${error.getMessage}")
      toolkit <- load(manifest.toolkit)
      snippets <- manifest.snippets.foldLeft[Either[String, List[ReferenceSnippet]]](Right(Nil))((acc, entry) =>
                    acc.flatMap(loaded => load(entry).map(snippet => loaded :+ snippet))
                  )
    yield ReferenceSnippetLibrary(toolkit, snippets)

  /** 题面里描述场景的文字（情绪、解读、去掉负面约束与技术段的 scenePrompt）。 */
  def sceneText(brief: SceneBrief): String =
    List(brief.mood, brief.memoryReading, NonSceneSections.replaceAllIn(brief.scenePrompt, "")).mkString("\n")

  /** 按关键词命中数挑片段（稳定排序：同分按 manifest 顺序），受数量与字节预算约束；全不命中时用默认组合。 */
  def select(library: ReferenceSnippetLibrary, text: String): List[ReferenceSnippet] =
    val scored = rankByKeywords(library.snippets, text)
    val ranked = if scored.nonEmpty then scored else DefaultIds.flatMap(id => library.snippets.find(_.id == id))
    withinBudget(ranked, MaxSelected)

  /**
   * 修订时补的片段：评审意见命中关键词、且上一版代码里还没有定义它的全部函数；都不命中就不补（返回空）。
   * toolkit 只在补进来的片段用到、上一版又缺的辅助函数时附带。
   */
  def selectForRepair(library: ReferenceSnippetLibrary, issues: List[String], previousCode: String): List[ReferenceSnippet] =
    val defined = definedFunctions(previousCode)
    val missing = rankByKeywords(library.snippets, issues.mkString("\n"))
      .filterNot(snippet => definedFunctions(snippet.source).subsetOf(defined))
    val chosen = withinBudget(missing, MaxRepairSelected)
    val toolkitUsed = definedFunctions(library.toolkit.source).filter(name => chosen.exists(_.source.contains(s"$name(")))
    if chosen.nonEmpty && !toolkitUsed.subsetOf(defined) then library.toolkit :: chosen else chosen

  /** 修订提示词里的片段段落；没有要补的片段（或片段库不可用）时为空串，不占提示词。 */
  def repairSection(issues: List[String], previousCode: String): String =
    library.fold(
      _ => "",
      loaded =>
        selectForRepair(loaded, issues, previousCode) match
          case Nil => ""
          case chosen =>
            s"""【参考片段（按本轮评审意见补充；手写、已在同一沙箱里渲染验证：${chosen.map(_.id).mkString(" + ")}）】
               |用法：评审点名的元素（例如树、建筑构件、水面）改用下面片段的写法重做，替换上一版里对应的旧代码；
               |复制前先看上一版代码里有没有同名函数，已有的不要重复声明；评审没点名的部分保持原样。
               |${renderBlocks(chosen)}""".stripMargin
    )

  private def rankByKeywords(snippets: List[ReferenceSnippet], text: String): List[ReferenceSnippet] =
    snippets
      .map(snippet => snippet -> snippet.keywords.count(text.contains))
      .filter(_._2 > 0)
      .sortBy(-_._2)
      .map(_._1)

  private def withinBudget(ranked: List[ReferenceSnippet], maxCount: Int): List[ReferenceSnippet] =
    ranked
      .foldLeft((List.empty[ReferenceSnippet], 0)) { case ((chosen, used), snippet) =>
        val size = byteSize(snippet.source)
        if chosen.size < maxCount && used + size <= SelectedBudgetBytes then (chosen :+ snippet, used + size)
        else (chosen, used)
      }
      ._1

  private def definedFunctions(code: String): Set[String] =
    FunctionName.findAllMatchIn(code).map(_.group(1)).toSet

  /** 拼进子代码提示词的 few-shot 段。 */
  def fewShotSection(brief: SceneBrief): String =
    library.fold(
      reason => s"【参考片段】本次不可用（$reason）：请按上面的设计实现要求自行实现，构件同样要咬合、不悬空。",
      loaded => render(loaded.toolkit, select(loaded, sceneText(brief)))
    )

  private def renderBlocks(snippets: List[ReferenceSnippet]): String =
    snippets
      .map(snippet => s"""(${snippet.id}) ${snippet.title}
                         |```js
                         |${snippet.source.trim}
                         |```""".stripMargin)
      .mkString("\n")

  private def render(toolkit: ReferenceSnippet, chosen: List[ReferenceSnippet]): String =
    val blocks = renderBlocks(toolkit :: chosen)
    s"""【参考片段（手写、已在同一沙箱里渲染验证；按本题面挑选：${(toolkit :: chosen).map(_.id).mkString(" + ")}）】
       |用法（硬性）：
       |1. 用到的辅助函数**原样复制**进 build(ctx) 函数体最前面（先 toolkit，再其它片段），然后调用它们搭场景；可以改参数、颜色、位置和数量，不要删构件、不要把结构改坏。
       |2. 片段没覆盖的元素自己写，但沿用同样的写法：先定统一的米制尺寸常量，再从这些常量推出每个构件的位置；构件之间要咬合——门窗不重叠、门底落在地面、立柱落地、雨棚/招牌有支撑、屋顶两端有山墙、树和石头不穿进建筑、树不挡主体门窗（canPlaceTree / makeForest 的 avoid 与 viewCorridors）。
       |3. 片段返回的 update(...) 要在 ctx.onFrame 里调用；带反射的片段（水面、湿街）把 ctx.renderer 和 scene 传进去。
       |4. 片段只是素材，不是答案：场景的主地标、构图与配色仍按题面来。
       |$blocks""".stripMargin

  private def load(entry: Entry): Either[String, ReferenceSnippet] =
    readResource(entry.file).map(source => ReferenceSnippet(entry.id, entry.title, entry.keywords, source))

  private def readResource(file: String): Either[String, String] =
    BundledResource.readText(s"$ResourceRoot$file")

  private def byteSize(text: String): Int = text.getBytes("UTF-8").length
