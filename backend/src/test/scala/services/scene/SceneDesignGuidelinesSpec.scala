package services.scene

import munit.FunSuite

import services.scene.utils.SceneContract
import services.scene.utils.prompts.{SceneDesignGuidelines, SceneCodePrompts}

/**
 * 设计感 v3 准则/few-shot 自检（2026-10-28 用户反馈：水面平淡、建筑只是盒子+三棱柱）：
 * 父准则必须含可执行的水面/建筑/构图/光影/材质/色彩/地标/尺度条款与 5 条设计负面约束；
 * 子准则必须给水面/建筑实现方向与参数范围；参考片段本身的校验见 ReferenceSnippetsSpec。
 */
class SceneDesignGuidelinesSpec extends FunSuite:

  test("父准则含可执行设计条款与 5 条设计负面约束") {
    val rules = SceneDesignGuidelines.parentRules
    List(
      "前景/中景/远景",
      "40–60%",
      "主光",
      "粗糙度",
      "palette",
      "主地标",
      "米制",
      "顶点波动",
      "波长 1.5–4m",
      "岸线泡沫",
      "反射条纹",
      "6–10 个可辨认构件",
      "挤出/倒角",
      "水面纯色无纹理",
      "盒子+三角屋顶",
      "近黑无主光",
      "大片空带",
      "随机球体堆叠"
    ).foreach(keyword => assert(rules.contains(keyword), s"父准则缺少：$keyword"))
  }

  test("子准则含水面/建筑实现方向与参数范围、负面约束") {
    val rules = SceneDesignGuidelines.childRules(60)
    List(
      "PlaneGeometry",
      "顶点 sin 叠加",
      "0.03–0.15m",
      "0.15–0.4m/s",
      "泡沫",
      "反射条纹",
      "≥6 个可辨认构件",
      "檐口",
      "暖光窗",
      "台阶",
      "ExtrudeGeometry",
      "倒角",
      "禁止",
      "随机球体堆叠"
    ).foreach(keyword => assert(rules.contains(keyword), s"子准则缺少：$keyword"))
  }

  test("父/子提示词已嵌入 v3 设计准则；子准则要求构件咬合，代码大小是软目标 + 硬上限") {
    val payload = SceneDesignGuidelines.parentRules + SceneDesignGuidelines.childRules(60)
    assert(payload.contains("构件咬合"), "子准则必须要求构件咬合、不悬空")
    assert(payload.contains("代码建议 15–35KB") && payload.contains("硬上限 60KB"), "代码大小应写成软目标 + 与配置同源的硬上限")
    assert(payload.contains("水面"), "设计准则必须含水面")
    assert(payload.contains("建筑"), "设计准则必须含建筑")
    assert(
      SceneContract.MinAvoidItems >= 6 && SceneContract.MaxAvoidItems >= 6,
      "设计感 v3 需要至少 6 条 avoid（当前 Min/Max=" + SceneContract.MinAvoidItems + "/" + SceneContract.MaxAvoidItems + "）"
    )
    assert(SceneCodePrompts.Version == "scene-parent-v3.5")
    assert(SceneCodePrompts.RepairVersion == "scene-repair-v3.2")
  }

  test("D5 v3.4：主地标优先常见好建的结构，罕见结构换成同氛围的常见元素而不硬复刻") {
    val rules = SceneDesignGuidelines.parentRules
    assert(rules.contains("主地标优先选常见"), rules)
    assert(rules.contains("不要硬复刻"), rules)
    assert(rules.contains("草坡上一间带圆形绿门的小木屋"), "示例应给出可执行的替换方向")
  }
