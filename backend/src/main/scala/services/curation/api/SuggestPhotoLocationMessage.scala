package services.curation.api

import java.sql.Connection

import cats.effect.IO
import cats.syntax.all.*

import services.curation.objects.{LocationCandidate, LocationCandidateId}
import services.curation.objects.apiTypes.PhotoLocationCandidatesResponse
import services.curation.tables.PhotoLocationCandidateTable
import services.curation.utils.{CurationImages, CurrentTime, LocationCandidateValidation, LocationCandidateViews}
import services.curation.utils.prompts.LocationCandidatePrompts
import services.gallery.api.GetPhotoContentMessage
import services.gallery.objects.{PhotoId, PhotoVariant}
import services.gallery.tables.{ExhibitionPhotoTable, ExhibitionTable}
import services.system.ai.AiRuntime
import services.system.api.{APIWithTokenMessage, ApiError, ApiException}
import services.system.db.Transaction
import services.system.startup.AppRuntime
import services.users.objects.UserId

/**
 * suggestphotolocation（v1.13）：作者为草稿照片请求 AI 地点候选。
 *
 * 校验照片存在/属于本人展览/未归档 → 读取照片字节后重编码为无元数据展示图（AI 输入不携带 photoId、业务 ID、
 * token、照片元数据或已确认位置）→ 独立 LocationModel（photo-location-v1）→ 逐条校验丢弃非法/截断至 5 条 →
 * 同一事务内替换该照片当前候选集并返回；模型或全部候选非法按 MODEL_FAILURE，旧候选保留。
 */
final case class SuggestPhotoLocationMessage(userId: UserId, photoId: PhotoId)
    extends APIWithTokenMessage[PhotoLocationCandidatesResponse]:
  override def plan(connection: Connection): IO[PhotoLocationCandidatesResponse] =
    for
      photo <- ExhibitionPhotoTable.findById(connection, photoId).flatMap {
                 case Some(found) => IO.pure(found)
                 case None => IO.raiseError(SuggestPhotoLocationMessage.notFound)
               }
      _ <- ExhibitionTable.requireOwned(connection, photo.exhibitionId, userId).adaptError {
             case _: ApiException => SuggestPhotoLocationMessage.notFound
           }
      _ <- IO.raiseWhen(photo.archivedAt.isDefined)(SuggestPhotoLocationMessage.notFound)
      config <- AppRuntime.config
      ports <- AiRuntime.ports
      content <- GetPhotoContentMessage(userId, photoId, PhotoVariant.Full, config.dataDir).plan(connection)
      image <- CurationImages.toAnalysisImage(content.bytes)
      now <- CurrentTime.now
      // AI 会话标识用随机值，不携带 photoId 等业务 ID。
      sessionId <- IO.randomUUID.map(uuid => s"photo-location-${uuid.toString}")
      prompt = LocationCandidatePrompts.suggest(sessionId)
      // AI 端口异常统一收口为 MODEL_FAILURE（保留已是 ApiException 的具体错误码）。
      drafts <- ports.location.suggestCandidates(image, prompt).handleErrorWith {
                  case error: ApiException => IO.raiseError(error)
                  case error =>
                    IO.raiseError(
                      ApiException(
                        ApiError.modelFailure(
                          s"地点模型调用失败：${Option(error.getMessage).filter(_.nonEmpty).getOrElse(error.getClass.getSimpleName)}"
                        )
                      )
                    )
                }
      valid <- LocationCandidateValidation.validate(drafts.candidates)
      model = LocationCandidatePrompts.Version
      candidates <- valid.zipWithIndex.traverse { case (candidate, index) =>
                      IO.randomUUID.map { uuid =>
                        LocationCandidate(
                          id = LocationCandidateId(uuid),
                          photoId = photoId,
                          name = candidate.name,
                          latitude = candidate.latitude,
                          longitude = candidate.longitude,
                          granularity = candidate.granularity,
                          reason = candidate.reason,
                          model = model,
                          // 同批候选用毫秒偏移保证读取顺序稳定（同一事务写入，对外 generatedAt 取首条）。
                          generatedAt = now.plusMillis(index.toLong)
                        )
                      }
                    }
      _ <- Transaction(connection)(
             PhotoLocationCandidateTable.deleteByPhotoId(connection, photoId) *>
               candidates.traverse_(candidate => PhotoLocationCandidateTable.insert(connection, candidate))
           )
      response = LocationCandidateViews.response(photoId, candidates)
    yield response

object SuggestPhotoLocationMessage:
  private val notFound = ApiException(ApiError.notFound("照片不存在"))
