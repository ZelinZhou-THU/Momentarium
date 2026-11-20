/**
 * PublicShow 的 decode 薄层（D7 DTO 收敛）：
 * 契约类型与严格解析器的唯一来源是共享的 `frontend/src/objects/gallery/*`
 * （由 web-lead 维护，PublishBar 等页面共用）；页面只在这里统一转出，
 * 避免各处散落 import 路径，也保留页面级 decode 入口。
 *
 * 说明：共享解析器与页面此前实现逐字段等价（真实 wire 夹具与测试保证行为一致），
 * 因此删除页面级重复 interface/parser，仅保留本薄层。
 */
export {
  parsePublicExhibitionView,
  parsePublicGroupView,
  parsePublicPhotoView,
} from "../../../objects/gallery/PublicExhibitionView";
export type {
  PublicExhibitionView,
  PublicGroupView,
  PublicPhotoView,
} from "../../../objects/gallery/PublicExhibitionView";
export { parsePublishedSceneResponse } from "../../../objects/gallery/PublishedSceneResponse";
export type { PublishedSceneResponse } from "../../../objects/gallery/PublishedSceneResponse";
