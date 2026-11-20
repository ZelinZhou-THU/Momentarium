import { parsePhotoLocationView } from "../../objects/gallery/PhotoLocationView";
import type {
  LocationGranularity,
  PhotoLocationView,
} from "../../objects/gallery/PhotoLocationView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 SetPhotoLocationMessage（POST /api/setphotolocation，契约 v1.7）。
 * 写入即作者确认：来源由服务端判定（确认既有建议保留 exif，改动记 manual），前端不提交 source。
 * 坐标可空但必须成对；granularity=hidden 允许只标地名，area/exact 必须有坐标。
 */
export class SetPhotoLocationAPI {
  constructor(
    readonly photoId: string,
    readonly name: string,
    readonly granularity: LocationGranularity,
    readonly latitude: number | null = null,
    readonly longitude: number | null = null,
  ) {}

  send(options?: ApiCallOptions): Promise<PhotoLocationView> {
    return send(
      {
        routeName: apiName("SetPhotoLocationAPI"),
        body: {
          photoId: this.photoId,
          name: this.name,
          latitude: this.latitude,
          longitude: this.longitude,
          granularity: this.granularity,
        },
      },
      parsePhotoLocationView,
      options,
    );
  }
}
