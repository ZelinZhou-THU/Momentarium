package services.system.assets

/**
 * 雾中海岸参考场景（scene3d task-56 最终版，纯环境、无照片、无 DOM、无网络）的源码，唯一一份：
 * `src/main/resources/scene/fallback/foggy-coast.js`（原型评审画廊 `prototypes/three/design-refs` 也读这个文件）。
 *
 * 两处使用：scene 服务的兜底场景（模型失败或修订用尽）与 `AI_MODE=fake` 的固定输出。
 * 资源随 jar 打包，缺失说明构建本身有问题，因此首次使用时直接中止，而不是把空代码当场景发布。
 */
object FoggyCoastScene:

  val Path = "scene/fallback/foggy-coast.js"

  val code: String =
    BundledResource.readText(Path).fold(message => throw IllegalStateException(message), identity)
