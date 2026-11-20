package services.curation.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.curation.objects.ChatRole
import services.curation.objects.apiTypes.RefineCurationResponse
import services.curation.tables.ChatMessageTable
import services.curation.utils.{ChatSessions, CurationState, CurationValidator, CurrentTime}
import services.curation.utils.prompts.RefinePrompts
import services.gallery.objects.{ExhibitionId, PhotoId}
import services.gallery.tables.ExhibitionTable
import services.system.ai.AiRuntime
import services.system.ai.objects.StructuredPrompt
import services.system.ai.ports.TextModel
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.system.db.Transaction
import services.users.objects.UserId

/**
 * refinecuration（spec 10.3）：服务端权威策展状态 + 最近 6 条对话 + 用户指令 → reply + 提案。
 * 提案只回给前端待用户确认；AI 不直接写业务数据（应用由 gallery 的 updatecuration 完成）。
 */
final case class RefineCurationMessage(
  userId: UserId,
  exhibitionId: ExhibitionId,
  instruction: String
) extends APIWithTokenMessage[RefineCurationResponse]:

  private val RecentMessageCount = 6

  override def plan(connection: Connection): IO[RefineCurationResponse] =
    for
      _ <- IO.fromEither(
             CurationValidator.validateInstruction(instruction).left.map(reason => ApiException(ApiError.badRequest(reason)))
           )
      exhibition <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      state <- CurationState.load(connection, exhibition)
      _ <- IO.raiseWhen(state.photos.isEmpty)(ApiException(ApiError.badRequest("展览还没有照片，无法修订策展")))
      ports <- AiRuntime.ports
      now <- CurrentTime.now
      session <- ChatSessions.findOrCreate(connection, exhibitionId, userId, now)
      recentMessages <- ChatMessageTable.listRecent(connection, session.id, RecentMessageCount)
      prompt = RefinePrompts.refine(session.id.value.toString, state, recentMessages, instruction)
      response <- ports.text.structured[RefineCurationResponse](prompt)
      validated <- ensureValid(ports.text, prompt, response, state.photoIds)
      _ <- Transaction(connection)(
             for
               _ <- ChatSessions.append(connection, session.id, ChatRole.User, instruction, now)
               // 同一轮里 user 与 assistant 的 createdAt 必须可区分，列表按时间排序才稳定。
               _ <- ChatSessions.append(
                      connection,
                      session.id,
                      ChatRole.Assistant,
                      validated.reply,
                      now.plusMillis(1)
                    )
             yield ()
           )
    yield validated

  private def ensureValid(
    text: TextModel,
    prompt: StructuredPrompt,
    response: RefineCurationResponse,
    exhibitionPhotoIds: Set[PhotoId]
  ): IO[RefineCurationResponse] =
    CurationValidator.validateRefine(response.reply, response.proposal, exhibitionPhotoIds) match
      case Right(_) => IO.pure(response)
      case Left(errors) =>
        val repairPrompt = prompt.copy(
          instructions = prompt.instructions +
            "\n\n上一次输出违反以下规则，请修正后重新输出完整 JSON：\n" +
            errors.map(error => s"- $error").mkString("\n")
        )
        text.structured[RefineCurationResponse](repairPrompt).flatMap { repaired =>
          CurationValidator.validateRefine(repaired.reply, repaired.proposal, exhibitionPhotoIds) match
            case Right(_) => IO.pure(repaired)
            case Left(remaining) =>
              IO.raiseError(
                ApiException(ApiError.modelFailure(s"修订提案未通过校验：${remaining.take(3).mkString("；")}"))
              )
        }
