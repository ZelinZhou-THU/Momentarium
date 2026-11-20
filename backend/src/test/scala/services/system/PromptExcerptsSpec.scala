package services.system

import munit.FunSuite

import services.system.ai.PromptExcerpts

/** 讲述摘录清洗与封顶：他人输入进提示词前必须折叠换行/控制字符、截断、封顶，且不带署名。 */
class PromptExcerptsSpec extends FunSuite:

  test("excerpt：控制字符与换行折成单个空格，空白折叠并去首尾") {
    assertEquals(PromptExcerpts.excerpt("  海风\n很大\t\t雨\u0000停了  "), "海风 很大 雨 停了")
    assertEquals(PromptExcerpts.excerpt("\n\t "), "")
  }

  test("excerpt：按 Unicode 码点截断并以省略号结尾，emoji 不被劈开") {
    val text = "海" * 10 + "🌊" * 10
    val cut = PromptExcerpts.excerpt(text, 12)
    assertEquals(cut, "海" * 10 + "🌊🌊…")
    assertEquals(PromptExcerpts.excerpt("短文本", 12), "短文本")
  }

  test("byKey：每个 key 最多取前几条非空摘录；没有内容的 key 不出现") {
    val picked = PromptExcerpts.byKey(
      List("a" -> List("第一条", " ", "第二条", "第三条"), "b" -> Nil, "c" -> List("\n")),
      perKey = 2
    )
    assertEquals(picked, Map("a" -> List("第一条", "第二条")))
  }

  test("byKey：总字数用完后其余 key 不再带入，已带入的保持顺序") {
    val picked = PromptExcerpts.byKey(
      List("a" -> List("一二三四五"), "b" -> List("六七八九十"), "c" -> List("十一十二")),
      total = 10
    )
    assertEquals(picked.keySet, Set("a", "b"))
  }

  test("suffix：没有讲述为空串；有讲述时每条用「」包起来并标明来源是讲述") {
    assertEquals(PromptExcerpts.suffix(Nil), "")
    assertEquals(PromptExcerpts.suffix(List("海风很大", "雨停了")), "｜讲述：「海风很大」「雨停了」")
  }
