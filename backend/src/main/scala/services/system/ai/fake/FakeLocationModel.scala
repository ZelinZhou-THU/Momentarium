package services.system.ai.fake

import cats.effect.IO

import services.system.ai.objects.{ImageBytes, LocationCandidateDraft, LocationCandidateDrafts, LocationCandidatePrompt}
import services.system.ai.ports.LocationModel

/** 确定性地点模型（AI_MODE=fake / 测试）：按图片字节哈希在固定样例中取一组，同一照片永远同一结果。
  * 样例含 area/area/hidden 三种粒度，hidden 候选不带坐标；空候选与失败由测试注入自定义实现。 */
final class FakeLocationModel extends LocationModel:

  private val samples: List[LocationCandidateDrafts] = List(
    LocationCandidateDrafts(
      List(
        LocationCandidateDraft("济州岛 · 城山日出峰", Some(33.4587), Some(126.9422), Some("area"), "黑色礁石海岸与日出峰的山脊轮廓"),
        LocationCandidateDraft("济州岛 · 涯月邑", Some(33.4632), Some(126.3175), Some("area"), "低矮石墙、海边小路与远处岛屿"),
        LocationCandidateDraft("济州岛", None, None, None, "只能判断到岛屿级别，无法定位具体地点")
      )
    ),
    LocationCandidateDrafts(
      List(
        LocationCandidateDraft("京都 · 鸭川河岸", Some(35.0116), Some(135.7681), Some("area"), "河岸步道、低矮护栏与城市背景"),
        LocationCandidateDraft("京都 · 出町柳", Some(35.0303), Some(135.7727), Some("area"), "三角洲与河岸开阔处的特征"),
        LocationCandidateDraft("日本 · 京都", None, None, None, "只能判断到城市级别")
      )
    ),
    LocationCandidateDrafts(
      List(
        LocationCandidateDraft("青岛 · 八大关", Some(36.0555), Some(120.3526), Some("area"), "红瓦屋顶、坡道与行道树的组合"),
        LocationCandidateDraft("青岛 · 第二海水浴场", Some(36.0508), Some(120.3452), Some("area"), "沙滩与礁石交界的海岸线"),
        LocationCandidateDraft("中国 · 青岛", None, None, None, "只能判断到城市级别")
      )
    )
  )

  override def suggestCandidates(image: ImageBytes, prompt: LocationCandidatePrompt): IO[LocationCandidateDrafts] =
    val index = Math.floorMod(java.util.Arrays.hashCode(image.bytes), samples.length)
    IO.pure(samples(index))
