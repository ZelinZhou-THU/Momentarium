package services.scene.utils

import services.system.assets.FoggyCoastScene

/**
 * 兜底场景工件（spec 9.6，设计感 v3）：雾中海岸 + 可读水面（DataTexture 法线贴图波浪高光 + 程序化条纹/泡沫 + 细分多波
 * + CubeCamera 受控反射）+ 记忆馆（10 构件）+ 灯塔 + 前景湿岩 + 远景雾层；无照片实体、无 DOM、无网络。
 * 源码只有一份，见 [[FoggyCoastScene]]（`resources/scene/fallback/foggy-coast.js`，与 AI_MODE=fake 的固定输出共用）。
 * 在模型生成失败或修订次数用尽时使用（source=Fallback）。
 */
private[scene] object FallbackScene:

  val code: String = FoggyCoastScene.code
