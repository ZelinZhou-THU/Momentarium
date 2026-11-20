package services.curation.api

import java.sql.Connection

import cats.effect.IO

import services.curation.objects.apiTypes.ThemeSuggestionsResponse
import services.curation.utils.{CurationState, CurationValidator, CurrentTime, PhotoAnalyses}
import services.curation.utils.prompts.ThemePrompts
import services.gallery.objects.{ExhibitionId, PhotoId}
import services.gallery.tables.ExhibitionTable
import services.system.ai.AiRuntime
import services.system.ai.objects.StructuredPrompt
import services.system.ai.ports.TextModel
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * suggestthemes（spec 10.2）：校验展览归属 → 读取章节/照片（gallery 公开表）→ 补齐照片分析缓存
 * （并发 4、单张重试 1、全部失败才 MODEL_FAILURE）→ 文本模型出 2–3 个主题方案 → 硬校验并回灌重试 1 次。
 */
final case class SuggestThemesMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  hint: Option[String]
) extends APIWithTokenMessage[ThemeSuggestionsResponse]:

  override def plan(connection: Connection): IO[ThemeSuggestionsResponse] =
    for
      _ <- IO.fromEither(
             CurationValidator.validateHint(hint).left.map(reason => ApiException(ApiError.badRequest(reason)))
           )
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      state <- CurationState.load(connection, exhibition)
      _ <- IO.raiseWhen(state.photos.isEmpty)(ApiException(ApiError.badRequest("展览还没有照片，无法生成主题")))
      config <- AppRuntime.config
      ports <- AiRuntime.ports
      now <- CurrentTime.now
      sessionId = s"curation-suggest-${exhibitionId.value}"
      analyses <- PhotoAnalyses.ensure(
                    connection = connection,
                    userId = userId,
                    photos = state.photos,
                    dataDirectory = config.dataDir,
                    sessionId = sessionId,
                    model = config.ai.visionModel,
                    ai = ports,
                    now = now
                  )
      prompt = ThemePrompts.suggestThemes(sessionId, state, analyses, hint)
      response <- ports.text.structured[ThemeSuggestionsResponse](prompt)
      validated <- ensureValid(ports.text, prompt, response, state.photoIds)
    yield validated

  /** 业务校验失败时把违反的规则回灌给模型重试 1 次；仍不合法按 MODEL_FAILURE 收口。 */
  private def ensureValid(
    text: TextModel,
    prompt: StructuredPrompt,
    response: ThemeSuggestionsResponse,
    exhibitionPhotoIds: Set[PhotoId]
  ): IO[ThemeSuggestionsResponse] =
    CurationValidator.validateThemeSuggestions(response.proposals, exhibitionPhotoIds) match
      case Right(_) => IO.pure(response)
      case Left(errors) =>
        val repairPrompt = prompt.copy(
          instructions = prompt.instructions +
            "\n\n上一次输出违反以下规则，请修正后重新输出完整 JSON：\n" +
            errors.map(error => s"- $error").mkString("\n")
        )
        text.structured[ThemeSuggestionsResponse](repairPrompt).flatMap { repaired =>
          CurationValidator.validateThemeSuggestions(repaired.proposals, exhibitionPhotoIds) match
            case Right(_) => IO.pure(repaired)
            case Left(remaining) =>
              IO.raiseError(
                ApiException(ApiError.modelFailure(s"主题方案未通过校验：${remaining.take(3).mkString("；")}"))
              )
        }
