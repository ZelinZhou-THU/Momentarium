package services.system.ai.fake

import cats.effect.IO

import services.curation.objects.PhotoAnalysis
import services.system.ai.objects.{ImageBytes, PhotoAnalysisPrompt}
import services.system.ai.ports.VisionModel

/** 确定性视觉模型（AI_MODE=fake / 测试）：按图片字节哈希在固定样例中取一条，同一照片永远同一结果。 */
final class FakeVisionModel extends VisionModel:

  private val samples: List[PhotoAnalysis] = List(
    PhotoAnalysis(
      description = "海风里泛白的浪线反复没过黑色礁石，远处的山脊沉在低云下面。",
      mood = "孤独而坚定的开阔",
      palette = List("#1B2A4A", "#F2A65A", "#E8635A"),
      memoryCues = List("退潮后礁石上的盐光", "远处山坡的轮廓"),
      sensory = "咸湿的海风与反复的浪声",
      suggestedCaption = "浪把黄昏揉碎在黑石上"
    ),
    PhotoAnalysis(
      description = "斜射的日光落在木桌与旧书上，空气里的灰尘缓慢浮动。",
      mood = "温暖的室内午后",
      palette = List("#F6F2EA", "#8C5A3B", "#E4DDD1"),
      memoryCues = List("旧书页的折角", "窗边慢慢移动的光斑"),
      sensory = "纸页气味与晒暖的木头味",
      suggestedCaption = "光停在读到一半的页码上"
    ),
    PhotoAnalysis(
      description = "霓虹在湿漉漉的街面拉出长长的倒影，人群从光里穿过。",
      mood = "热闹而短暂的夜晚",
      palette = List("#0F172A", "#38BDF8", "#F472B6"),
      memoryCues = List("雨停后路面的反光", "远处招牌的闪烁"),
      sensory = "潮湿路面与夜晚的凉风",
      suggestedCaption = "雨停之后，整条街都在发光"
    ),
    PhotoAnalysis(
      description = "画面里的明暗交替，让视线在远近之间慢慢移动。",
      mood = "安静而开阔",
      palette = List("#8499A4", "#D8D3C6", "#465D68"),
      memoryCues = List("远处的轮廓", "光影的变化"),
      sensory = "一阵轻缓的风",
      suggestedCaption = "把这一刻留在远方"
    ),
    PhotoAnalysis(
      description = "柔和的色调与细小的纹理，让寻常的片刻显得格外清晰。",
      mood = "温柔而平静",
      palette = List("#D6C7B1", "#A28C78", "#E9E3D8"),
      memoryCues = List("柔和的色调", "细微的纹理"),
      sensory = "缓慢流动的空气",
      suggestedCaption = "平常时刻的温柔"
    ),
    PhotoAnalysis(
      description = "画面由近及远舒展开来，留出一段可以想象的距离。",
      mood = "自由而舒展",
      palette = List("#718A83", "#C7D2C5", "#E7DFCE"),
      memoryCues = List("远近之间的层次", "空出来的空间"),
      sensory = "清新的空气",
      suggestedCaption = "沿着目光继续走"
    ),
    PhotoAnalysis(
      description = "深浅不同的颜色在画面中相遇，形成安稳的节奏。",
      mood = "沉静而充实",
      palette = List("#344D5A", "#8A9E9B", "#D4C6AE"),
      memoryCues = List("颜色交接的地方", "沉静的层次"),
      sensory = "片刻的安静",
      suggestedCaption = "时光在这里放慢"
    ),
    PhotoAnalysis(
      description = "明亮的部分吸引视线，周围的细节随之慢慢显现。",
      mood = "轻快而明朗",
      palette = List("#E9D7AE", "#A7B5A5", "#6A817D"),
      memoryCues = List("明亮的一角", "渐渐显现的细节"),
      sensory = "明亮轻盈的气息",
      suggestedCaption = "光落下来的时候"
    ),
    PhotoAnalysis(
      description = "不规则的线条与色块交织，让画面带着自然的韵律。",
      mood = "自在而生动",
      palette = List("#687C70", "#B3B7A2", "#E2D8C5"),
      memoryCues = List("交错的线条", "自然的色块"),
      sensory = "轻轻掠过的风",
      suggestedCaption = "在路上遇见这一刻"
    ),
    PhotoAnalysis(
      description = "画面保留了柔和的边界，像一段还在延续的记忆。",
      mood = "朦胧而怀念",
      palette = List("#8D9AA0", "#C9CECA", "#EEE5D6"),
      memoryCues = List("模糊的边界", "柔和的光"),
      sensory = "微凉的空气",
      suggestedCaption = "记忆里的柔光"
    ),
    PhotoAnalysis(
      description = "画面中的细节彼此呼应，构成一个值得停留的瞬间。",
      mood = "亲切而宁静",
      palette = List("#A78067", "#D7BFA4", "#EAE1D2"),
      memoryCues = List("彼此呼应的细节", "停留的瞬间"),
      sensory = "温暖的气息",
      suggestedCaption = "这一刻值得记住"
    ),
    PhotoAnalysis(
      description = "疏密有致的构图让目光停驻，也为画面留下呼吸的余地。",
      mood = "从容而清澈",
      palette = List("#6D8793", "#B6C6C8", "#E8E4DA"),
      memoryCues = List("构图中的留白", "清晰的轮廓"),
      sensory = "清凉而安静的片刻",
      suggestedCaption = "留一点时间给眼前"
    )
  )

  override def analyze(image: ImageBytes, prompt: PhotoAnalysisPrompt): IO[PhotoAnalysis] =
    val index = Math.floorMod(java.util.Arrays.hashCode(image.bytes), samples.length)
    IO.pure(samples(index))
