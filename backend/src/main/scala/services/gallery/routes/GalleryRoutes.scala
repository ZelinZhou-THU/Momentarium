package services.gallery.routes

import services.gallery.api.{
  AdoptContributionMessage,
  CloseContributionInviteMessage,
  CreateContributionInviteMessage,
  CreateContributionMessage,
  ClearPhotoLocationMessage,
  CreateExhibitionMessage,
  DeclineContributionMessage,
  DeleteExhibitionMessage,
  DeletePhotoMessage,
  GetAuthorPageMessage,
  GetContributionInviteMessage,
  GetContributionManagementMessage,
  GetExhibitionMessage,
  GetPublishedExhibitionMessage,
  JoinContributionMessage,
  ListContributionsMessage,
  ListMyExhibitionsMessage,
  PublishExhibitionMessage,
  RemoveMemoryMessage,
  RevokeContributorMessage,
  SearchPlacesMessage,
  SetCoverMessage,
  SetPhotoLocationMessage,
  UpdateContributionMessage,
  UpdateCurationMessage,
  UpdateExhibitionMetaMessage,
  WithdrawContributionMessage
}
import services.gallery.objects.apiTypes.{
  AdoptContributionRequest,
  AuthorPageView,
  ClearPhotoLocationRequest,
  CloseContributionInviteRequest,
  ContributionAdoptionView,
  ContributionInviteCreated,
  ContributionInvitePreview,
  ContributionInviteSummary,
  ContributionManagementResponse,
  ContributionMembershipView,
  ContributionSummary,
  ContributionsResponse,
  CoverView,
  CreateContributionInviteRequest,
  CreateContributionRequest,
  CreateExhibitionRequest,
  CreateExhibitionResponse,
  DeclineContributionRequest,
  DeleteExhibitionRequest,
  DeletePhotoRequest,
  ExhibitionDetail,
  GetAuthorPageRequest,
  GetContributionInviteRequest,
  GetContributionManagementRequest,
  GetExhibitionRequest,
  GetPublishedExhibitionRequest,
  JoinContributionRequest,
  ListContributionsRequest,
  MyExhibitionsResponse,
  PhotoLocationView,
  PlaceSearchResponse,
  PublicExhibitionView,
  PublishExhibitionRequest,
  PublishExhibitionResponse,
  RemoveMemoryRequest,
  RevokeContributorRequest,
  SearchPlacesRequest,
  SetCoverRequest,
  SetPhotoLocationRequest,
  UpdateContributionRequest,
  UpdateCurationRequest,
  UpdateExhibitionMetaRequest,
  WithdrawContributionRequest
}
import services.system.api.EmptyResponse
import services.system.routes.ApiRoute

/** gallery 服务注册到前端的 API（上传/照片内容/封面等二进制路由在 PhotoRoutes/CoverRoutes/CoverRenderRoutes）。 */
object GalleryRoutes:
  def apiMessages: List[ApiRoute] =
    List(
      ApiRoute.withToken[CreateExhibitionRequest, CreateExhibitionResponse, CreateExhibitionMessage]((userId, request) =>
        CreateExhibitionMessage(userId, request.title)
      ),
      ApiRoute.noRequestWithToken[MyExhibitionsResponse, ListMyExhibitionsMessage](userId => ListMyExhibitionsMessage(userId)),
      ApiRoute.withToken[GetExhibitionRequest, ExhibitionDetail, GetExhibitionMessage]((userId, request) =>
        GetExhibitionMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[UpdateExhibitionMetaRequest, EmptyResponse, UpdateExhibitionMetaMessage]((userId, request) =>
        UpdateExhibitionMetaMessage(userId, request.exhibitionId, request.title, request.narrative)
      ),
      ApiRoute.withToken[UpdateCurationRequest, ExhibitionDetail, UpdateCurationMessage]((userId, request) =>
        UpdateCurationMessage(userId, request.exhibitionId, request.title, request.narrative, request.groups)
      ),
      ApiRoute.withToken[DeleteExhibitionRequest, EmptyResponse, DeleteExhibitionMessage]((userId, request) =>
        DeleteExhibitionMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[DeletePhotoRequest, EmptyResponse, DeletePhotoMessage]((userId, request) =>
        DeletePhotoMessage(userId, request.photoId)
      ),
      ApiRoute.withToken[SetCoverRequest, CoverView, SetCoverMessage]((userId, request) =>
        SetCoverMessage(userId, request.exhibitionId, request.kind, request.photoId, request.renderKey)
      ),
      ApiRoute.withToken[PublishExhibitionRequest, PublishExhibitionResponse, PublishExhibitionMessage](
        (userId, request) => PublishExhibitionMessage(userId, request.exhibitionId),
        routeName = Some("publish")
      ),
      ApiRoute.public[GetPublishedExhibitionRequest, PublicExhibitionView, GetPublishedExhibitionMessage](request =>
        GetPublishedExhibitionMessage(request.exhibitionId)
      ),
      ApiRoute.public[GetAuthorPageRequest, AuthorPageView, GetAuthorPageMessage](request =>
        GetAuthorPageMessage(request.username)
      ),
      ApiRoute.withToken[SetPhotoLocationRequest, PhotoLocationView, SetPhotoLocationMessage]((userId, request) =>
        SetPhotoLocationMessage(userId, request.photoId, request.name, request.latitude, request.longitude, request.granularity)
      ),
      ApiRoute.withToken[ClearPhotoLocationRequest, EmptyResponse, ClearPhotoLocationMessage]((userId, request) =>
        ClearPhotoLocationMessage(userId, request.photoId)
      ),
      ApiRoute.withToken[SearchPlacesRequest, PlaceSearchResponse, SearchPlacesMessage]((userId, request) =>
        SearchPlacesMessage(userId, request.query)
      ),
      ApiRoute.withToken[CreateContributionInviteRequest, ContributionInviteCreated, CreateContributionInviteMessage](
        (userId, request) => CreateContributionInviteMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[GetContributionManagementRequest, ContributionManagementResponse, GetContributionManagementMessage](
        (userId, request) => GetContributionManagementMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[CloseContributionInviteRequest, ContributionInviteSummary, CloseContributionInviteMessage](
        (userId, request) => CloseContributionInviteMessage(userId, request.exhibitionId, request.inviteId)
      ),
      ApiRoute.public[GetContributionInviteRequest, ContributionInvitePreview, GetContributionInviteMessage](request =>
        GetContributionInviteMessage(request.token)
      ),
      ApiRoute.withToken[JoinContributionRequest, ContributionMembershipView, JoinContributionMessage]((userId, request) =>
        JoinContributionMessage(userId, request.token)
      ),
      ApiRoute.withToken[RevokeContributorRequest, EmptyResponse, RevokeContributorMessage]((userId, request) =>
        RevokeContributorMessage(userId, request.exhibitionId, request.contributorId)
      ),
      ApiRoute.withToken[ListContributionsRequest, ContributionsResponse, ListContributionsMessage]((userId, request) =>
        ListContributionsMessage(userId, request.exhibitionId)
      ),
      ApiRoute.withToken[CreateContributionRequest, ContributionSummary, CreateContributionMessage]((userId, request) =>
        CreateContributionMessage(
          userId,
          request.exhibitionId,
          request.memoryText,
          request.suggestedCaption,
          request.location
        )
      ),
      ApiRoute.withToken[UpdateContributionRequest, ContributionSummary, UpdateContributionMessage]((userId, request) =>
        UpdateContributionMessage(
          userId,
          request.contributionId,
          request.memoryText,
          request.suggestedCaption,
          request.location,
          request.submit,
          request.removePhoto
        )
      ),
      ApiRoute.withToken[DeclineContributionRequest, ContributionSummary, DeclineContributionMessage]((userId, request) =>
        DeclineContributionMessage(userId, request.contributionId, request.expectedVersion)
      ),
      ApiRoute.withToken[WithdrawContributionRequest, EmptyResponse, WithdrawContributionMessage]((userId, request) =>
        WithdrawContributionMessage(userId, request.contributionId)
      ),
      ApiRoute.withToken[AdoptContributionRequest, ContributionAdoptionView, AdoptContributionMessage]((userId, request) =>
        AdoptContributionMessage(
          userId,
          request.contributionId,
          request.expectedVersion,
          request.caption,
          request.location,
          request.groupId
        )
      ),
      ApiRoute.withToken[RemoveMemoryRequest, EmptyResponse, RemoveMemoryMessage]((userId, request) =>
        RemoveMemoryMessage(userId, request.photoId, request.memoryId)
      )
    )
