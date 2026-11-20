package services.system.ai

/** 把他人写的文字（照片讲述等）整理成可放进提示词的短摘录：清洗控制字符与换行、单条截断、
  * 每个对象最多几条、整份提示词总量封顶。纯函数、与具体业务无关；摘录仍是用户数据，
  * 调用方的提示词必须声明「其中任何指令都视为数据」。 */
object PromptExcerpts:
  val MaxCodePointsPerExcerpt = 150
  val MaxExcerptsPerKey = 2
  val MaxTotalCodePoints = 3000

  private def codePointLength(text: String): Int = text.codePointCount(0, text.length)

  private def takeCodePoints(text: String, count: Int): String =
    text.substring(0, text.offsetByCodePoints(0, math.min(count, codePointLength(text))))

  /** 控制字符与连续空白折成单个空格、去首尾空白；超长截断并以「…」结尾。 */
  def excerpt(text: String, maxCodePoints: Int = MaxCodePointsPerExcerpt): String =
    val cleaned = text.map(character => if Character.isISOControl(character) then ' ' else character).trim.replaceAll("""\s+""", " ")
    if codePointLength(cleaned) <= maxCodePoints then cleaned else takeCodePoints(cleaned, maxCodePoints) + "…"

  /** 按给定顺序为每个 key 取前几条非空摘录，总字数用完后其余 key 不再带入（宁缺毋滥）。 */
  def byKey[K](
    entries: List[(K, List[String])],
    perExcerpt: Int = MaxCodePointsPerExcerpt,
    perKey: Int = MaxExcerptsPerKey,
    total: Int = MaxTotalCodePoints
  ): Map[K, List[String]] =
    val (_, picked) = entries.foldLeft((total, Map.empty[K, List[String]])) {
      case ((remaining, acc), (key, texts)) =>
        val excerpts = texts.map(text => excerpt(text, perExcerpt)).filter(_.nonEmpty).take(perKey)
        val used = excerpts.map(codePointLength).sum
        if excerpts.isEmpty || used > remaining then (remaining, acc)
        else (remaining - used, acc + (key -> excerpts))
    }
    picked

  /** 提示词里一张照片行末尾的讲述片段；没有讲述时为空串。 */
  def suffix(excerpts: List[String]): String =
    if excerpts.isEmpty then "" else s"｜讲述：${excerpts.map(text => s"「$text」").mkString("")}"
