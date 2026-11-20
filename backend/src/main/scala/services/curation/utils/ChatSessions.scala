package services.curation.utils

import java.sql.Connection
import java.time.Instant

import cats.effect.IO

import services.curation.objects.{ChatMessage, ChatMessageId, ChatRole, ChatSession, ChatSessionId}
import services.curation.tables.{ChatMessageTable, ChatSessionTable}
import services.gallery.objects.ExhibitionId
import services.users.objects.UserId

/** 策展对话会话与消息的编排工具（表操作之上的少量业务拼接）。 */
private[curation] object ChatSessions:

  /** 每个用户对每个展览只保留一个最近会话；没有则创建。 */
  def findOrCreate(connection: Connection, exhibitionId: ExhibitionId, userId: UserId, now: Instant): IO[ChatSession] =
    ChatSessionTable.findLatestByExhibitionAndUser(connection, exhibitionId, userId).flatMap {
      case Some(session) => IO.pure(session)
      case None =>
        for
          id <- IO.randomUUID.map(ChatSessionId.apply)
          session = ChatSession(id, exhibitionId, userId, now)
          _ <- ChatSessionTable.insert(connection, session)
        yield session
    }

  def append(connection: Connection, sessionId: ChatSessionId, role: ChatRole, content: String, now: Instant): IO[ChatMessage] =
    for
      id <- IO.randomUUID.map(ChatMessageId.apply)
      message = ChatMessage(id, sessionId, role, content, now)
      _ <- ChatMessageTable.insert(connection, message)
    yield message
