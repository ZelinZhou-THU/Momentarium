package services.curation.routes

import services.curation.api.*
import services.curation.objects.apiTypes.*
import services.gallery.objects.apiTypes.PhotoLocationView
import services.system.routes.ApiRoute

/** curation 服务注册到前端的 7 条 API（spec 8.3）：suggestthemes / refinecuration / getchathistory / getphotoinsights，
  * 以及阶段 3 的 suggestphotolocation / getphotolocationcandidates / confirmphotolocationcandidate。 */
object CurationRoutes:
  def apiMessages: List[ApiRoute] =
    List(
      ApiRoute.withToken[SuggestThemesRequest, ThemeSuggestionsResponse, SuggestThemesMessage]((userId, request) =>
        SuggestThemesMessage(userId, request.exhibitionId, request.hint)
      ),
      ApiRoute.withToken[RefineCurationRequest, RefineCurationResponse, RefineCurationMessage]((userId, request) =>
        RefineCurationMessage(userId, request.exhibitionId, request.instruction)
      ),
      ApiRoute.withToken[GetChatHistoryRequest, ChatHistoryResponse, GetChatHistoryMessage]((userId, request) =>
        GetChatHistoryMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[GetPhotoInsightsRequest, PhotoInsightsResponse, GetPhotoInsightsMessage]((userId, request) =>
        GetPhotoInsightsMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[SuggestPhotoLocationRequest, PhotoLocationCandidatesResponse, SuggestPhotoLocationMessage](
        (userId, request) => SuggestPhotoLocationMessage(userId, request.photoId)
      ),
      ApiRoute.withToken[GetPhotoLocationCandidatesRequest, PhotoLocationCandidatesResponse, GetPhotoLocationCandidatesMessage](
        (userId, request) => GetPhotoLocationCandidatesMessage(userId, request.photoId)
      ),
      ApiRoute.withToken[ConfirmPhotoLocationCandidateRequest, PhotoLocationView, ConfirmPhotoLocationCandidateMessage](
        (userId, request) =>
          ConfirmPhotoLocationCandidateMessage(userId, request.photoId, request.candidateId, request.granularity)
      )
    )
