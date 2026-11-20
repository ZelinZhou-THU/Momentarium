package services.curation.api

import java.sql.Connection

import cats.effect.IO

import services.curation.objects.apiTypes.{ChatHistoryResponse, ChatMessageView}
import services.curation.tables.{ChatMessageTable, ChatSessionTable}
import services.gallery.objects.ExhibitionId
import services.gallery.tables.ExhibitionTable
import services.system.api.APIWithTokenMessage
import services.users.objects.UserId

/** getchathistory（spec 10.3）：仅展览作者可读；没有会话时返回空消息列表。 */
final case class GetChatHistoryMessage(
  userId: UserId,
  exhibitionId: ExhibitionId
) extends APIWithTokenMessage[ChatHistoryResponse]:

  override def plan(connection: Connection): IO[ChatHistoryResponse] =
    for
      _ <- ExhibitionTable.requireOwned(connection, exhibitionId, userId)
      session <- ChatSessionTable.findLatestByExhibitionAndUser(connection, exhibitionId, userId)
      messages <- session match
                    case Some(found) => ChatMessageTable.listBySession(connection, found.id)
                    case None => IO.pure(Nil)
    yield ChatHistoryResponse(
      messages.map(message => ChatMessageView(message.role, message.content, message.createdAt))
    )
