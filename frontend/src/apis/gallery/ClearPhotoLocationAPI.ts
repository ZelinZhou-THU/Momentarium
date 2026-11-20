import { parseEmptyResponse } from "../../objects/EmptyResponse";
import type { EmptyResponse } from "../../objects/EmptyResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 ClearPhotoLocationMessage（POST /api/clearphotolocation，契约 v1.7）。
 * 删除该照片的位置记录（含 EXIF 建议），回到“未知”；无记录时幂等成功。
 */
export class ClearPhotoLocationAPI {
  constructor(readonly photoId: string) {}

  send(options?: ApiCallOptions): Promise<EmptyResponse> {
    return send(
      { routeName: apiName("ClearPhotoLocationAPI"), body: { photoId: this.photoId } },
      parseEmptyResponse,
      options,
    );
  }
}
