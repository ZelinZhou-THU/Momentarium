import { parsePlaceSearchResponse } from "../../objects/gallery/PlaceSearchResponse";
import type { PlaceSearchResponse } from "../../objects/gallery/PlaceSearchResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";
import type { ApiCallOptions } from "../shared/send";

/**
 * 对应后端 SearchPlacesMessage（POST /api/searchplaces，契约 v1.7）。
 * 只在作者点击搜索时调用；query 只含用户明确输入的地点名称（不携带照片/坐标/令牌之外的数据）。
 * 无结果是 200 + candidates: []；提供方不可用是 503 UPSTREAM_UNAVAILABLE/PLACE_SEARCH_UNAVAILABLE。
 */
export class SearchPlacesAPI {
  constructor(readonly query: string) {}

  send(options?: ApiCallOptions): Promise<PlaceSearchResponse> {
    return send(
      { routeName: apiName("SearchPlacesAPI"), body: { query: this.query } },
      parsePlaceSearchResponse,
      options,
    );
  }
}
