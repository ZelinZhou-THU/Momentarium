package services.scene.routes

import services.scene.api.{
  AcceptSceneRunMessage,
  CancelSceneMessage,
  DismissSceneRunMessage,
  GenerateSceneMessage,
  GetPublishedSceneMessage,
  GetSceneRunByIdMessage,
  GetSceneRunMessage,
  ListSceneRunsMessage,
  RestoreSceneRunMessage,
  ReviewSceneMessage,
  ReviseSceneMessage
}
import services.scene.objects.apiTypes.{
  AcceptSceneRunRequest,
  CancelSceneRequest,
  DismissSceneRunRequest,
  GenerateSceneRequest,
  GetPublishedSceneRequest,
  GetSceneRunByIdRequest,
  GetSceneRunRequest,
  ListSceneRunsRequest,
  PublishedSceneResponse,
  RestoreSceneRunRequest,
  ReviewSceneRequest,
  ReviseSceneRequest,
  SceneRunHistoryResponse,
  SceneRunView
}
import services.system.routes.{ApiRoute, JsonRequestBody}

/**
 * scene 服务注册到前端的 API（D4：generatescene/getscenerun；D5：reviewscene/cancelscene；
 * D6：公开 getpublishedscene；版本历史 listsceneruns/getscenerunbyid/restorescenerun；
 * v1.14：revisescene/acceptscenerun）。
 */
object SceneRoutes:
  def apiMessages: List[ApiRoute] =
    List(
      ApiRoute.withToken[GenerateSceneRequest, SceneRunView, GenerateSceneMessage]((userId, request) =>
        GenerateSceneMessage(userId, request.exhibitionId, request.hint)
      ),
      ApiRoute.withToken[GetSceneRunRequest, SceneRunView, GetSceneRunMessage]((userId, request) =>
        GetSceneRunMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[ReviewSceneRequest, SceneRunView, ReviewSceneMessage](
        (userId, request) => ReviewSceneMessage(userId, request.runId, request.captures, request.runtime),
        maxRequestBodyBytes = Some(JsonRequestBody.ReviewMaxBytes)
      ),
      ApiRoute.withToken[CancelSceneRequest, SceneRunView, CancelSceneMessage]((userId, request) =>
        CancelSceneMessage(userId, request.runId)
      ),
      ApiRoute.public[GetPublishedSceneRequest, PublishedSceneResponse, GetPublishedSceneMessage](request =>
        GetPublishedSceneMessage(request.exhibitionId)
      ),
      ApiRoute.withToken[ListSceneRunsRequest, SceneRunHistoryResponse, ListSceneRunsMessage]((userId, request) =>
        ListSceneRunsMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[GetSceneRunByIdRequest, SceneRunView, GetSceneRunByIdMessage]((userId, request) =>
        GetSceneRunByIdMessage(userId, request.runId)
      ),
      ApiRoute.withToken[RestoreSceneRunRequest, SceneRunView, RestoreSceneRunMessage]((userId, request) =>
        RestoreSceneRunMessage(userId, request.runId)
      ),
      ApiRoute.withToken[ReviseSceneRequest, SceneRunView, ReviseSceneMessage](
        (userId, request) => ReviseSceneMessage(userId, request.parentRunId, request.instruction),
        maxRequestBodyBytes = Some(JsonRequestBody.RevisionMaxBytes)
      ),
      ApiRoute.withToken[AcceptSceneRunRequest, SceneRunView, AcceptSceneRunMessage]((userId, request) =>
        AcceptSceneRunMessage(userId, request.runId)
      ),
      ApiRoute.withToken[DismissSceneRunRequest, SceneRunView, DismissSceneRunMessage]((userId, request) =>
        DismissSceneRunMessage(userId, request.runId)
      )
    )
