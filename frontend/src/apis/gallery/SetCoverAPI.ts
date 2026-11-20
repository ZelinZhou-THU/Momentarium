import { parseCoverView } from "../../objects/gallery/CoverView";
import type { CoverKind, CoverView } from "../../objects/gallery/CoverView";
import { apiName } from "../shared/apiName";
import { send, type ApiCallOptions } from "../shared/send";

/**
 * 对应后端 SetCoverMessage（POST /api/setcover）。
 * photoId / renderKey 为 Option，按契约序列化为 null（不省略字段）。
 */
export class SetCoverAPI {
  constructor(
    readonly exhibitionId: string,
    readonly kind: CoverKind,
    readonly photoId: string | null = null,
    readonly renderKey: string | null = null,
  ) {}

  send(options?: ApiCallOptions): Promise<CoverView> {
    return send(
      {
        routeName: apiName("SetCoverAPI"),
        body: {
          exhibitionId: this.exhibitionId,
          kind: this.kind,
          photoId: this.photoId,
          renderKey: this.renderKey,
        },
      },
      parseCoverView,
      options,
    );
  }
}
