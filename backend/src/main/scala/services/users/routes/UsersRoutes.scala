package services.users.routes

import services.system.api.EmptyResponse
import services.system.routes.ApiRoute
import services.users.api.{
  ChangePasswordMessage,
  GetCurrentUserMessage,
  GetMyProfileMessage,
  LoginMessage,
  LogoutMessage,
  RegisterMessage,
  UpdateMyProfileMessage
}
import services.users.objects.apiTypes.{
  AuthResponse,
  ChangePasswordRequest,
  LoginRequest,
  ProfileView,
  RegisterRequest,
  UpdateMyProfileRequest,
  UserView
}

/** users 服务注册到前端的 7 条 API（含账户设置 getmyprofile/updatemyprofile/changepassword）；ResolveSessionMessage 仅供路由器内部调用。 */
object UsersRoutes:
  def apiMessages: List[ApiRoute] =
    List(
      ApiRoute.public[RegisterRequest, AuthResponse, RegisterMessage](request =>
        RegisterMessage(request.username, request.password)
      ),
      ApiRoute.public[LoginRequest, AuthResponse, LoginMessage](request =>
        LoginMessage(request.username, request.password)
      ),
      ApiRoute.noRequestWithToken[UserView, GetCurrentUserMessage](userId => GetCurrentUserMessage(userId)),
      ApiRoute.noRequestWithToken[EmptyResponse, LogoutMessage](userId => LogoutMessage(userId)),
      ApiRoute.noRequestWithToken[ProfileView, GetMyProfileMessage](userId => GetMyProfileMessage(userId)),
      ApiRoute.withToken[UpdateMyProfileRequest, ProfileView, UpdateMyProfileMessage]((userId, request) =>
        UpdateMyProfileMessage(userId, request.displayName, request.bio, request.homepagePublic)
      ),
      ApiRoute.withToken[ChangePasswordRequest, AuthResponse, ChangePasswordMessage]((userId, request) =>
        ChangePasswordMessage(userId, request.currentPassword, request.newPassword)
      )
    )
