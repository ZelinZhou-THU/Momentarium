package services.system.routes

import services.curation.routes.CurationRoutes
import services.gallery.routes.GalleryRoutes
import services.scene.routes.SceneRoutes
import services.users.routes.UsersRoutes

/** 顶层路由注册表：合并各服务 XXRoutes.apiMessages，router 本身不做业务判断。 */
object RouteRegistry:
  def apiMessages: List[ApiRoute] =
    UsersRoutes.apiMessages ++
      GalleryRoutes.apiMessages ++
      CurationRoutes.apiMessages ++
      SceneRoutes.apiMessages
