import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 RemoveMemoryMessage（POST /api/removememory，仅创建者）。
 * 只删已采用的讲述、不删照片；之后可重新采用到其他目标。
 */
export class RemoveMemoryAPI {
  constructor(
    readonly photoId: string,
    readonly memoryId: string,
  ) {}

  send(options?: ApiCallOptions): Promise<EmptyResponse> {
    return send(
      {
        routeName: apiName("RemoveMemoryAPI"),
        body: { photoId: this.photoId, memoryId: this.memoryId },
      },
      parseEmptyResponse,
      options,
    );
  }
}
