package services.scene.utils.prompts

import services.curation.objects.PhotoAnalysis
import services.gallery.objects.PhotoId
import services.scene.utils.SceneState
import services.system.ai.PromptExcerpts

/** 父/子提示词共用的素材文本（照片清单、章节、照片分析），保持两处口径一致。 */
private[scene] object PromptText:

  def groupAndPhotoLines(state: SceneState): String =
    val grouped = state.groups.map { group =>
      val photos = state.photos.filter(_.groupId.contains(group.id))
      val lines = photos.map(photo => photoLine(state, photo))
      s"- 章节「${group.title}」（理念：${if group.narrative.nonEmpty then group.narrative else "（无）"}）\n${lines.mkString("\n")}"
    }
    val ungrouped = state.photos.filter(_.groupId.isEmpty)
    val ungroupedSection =
      if ungrouped.isEmpty then ""
      else s"\n【未分组照片】\n${ungrouped.map(photo => photoLine(state, photo)).mkString("\n")}"
    (grouped.mkString("\n") + ungroupedSection).trim

  def analysisLines(state: SceneState, analyses: Map[PhotoId, PhotoAnalysis]): String =
    state.photos
      .map { photo =>
        analyses.get(photo.id) match
          case Some(analysis) =>
            s"- photoId=${photo.id.value}｜情绪：${analysis.mood}｜记忆线索：${analysis.memoryCues.mkString("、")}"
          case None => s"- photoId=${photo.id.value}｜（暂无分析，按图注理解）"
      }
      .mkString("\n")

  private def photoLine(state: SceneState, photo: services.gallery.objects.ExhibitionPhoto): String =
    val aspect = (photo.width, photo.height) match
      case (Some(width), Some(height)) if height != 0 => f"${width.toDouble / height.toDouble}%.2f"
      case _ => "未知"
    val caption = if photo.caption.nonEmpty then photo.caption else "（无图注）"
    s"  - photoId=${photo.id.value}｜宽高比≈$aspect｜图注：$caption${PromptExcerpts.suffix(state.memories.getOrElse(photo.id, Nil))}"
