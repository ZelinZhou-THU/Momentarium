import { parsePhotoLocationView } from "../../objects/gallery/PhotoLocationView";
import type {
  LocationGranularity,
  PhotoLocationView,
} from "../../objects/gallery/PhotoLocationView";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 ConfirmPhotoLocationCandidateMessage（POST /api/confirmphotolocationcandidate，仅作者）。
 * 把候选名称/坐标复制为 confirmed 位置（source=ai）；无坐标候选只能 hidden。
 * 确认不递增 curationVersion、不使场景过期，只影响未发布修改标记。
 */
export class ConfirmPhotoLocationCandidateAPI {
  constructor(
    readonly photoId: string,
    readonly candidateId: string,
    readonly granularity: LocationGranularity,
  ) {}

  send(options?: ApiCallOptions): Promise<PhotoLocationView> {
    return send(
      {
        routeName: apiName("ConfirmPhotoLocationCandidateAPI"),
        body: {
          photoId: this.photoId,
          candidateId: this.candidateId,
          granularity: this.granularity,
        },
      },
      parsePhotoLocationView,
      options,
    );
  }
}
