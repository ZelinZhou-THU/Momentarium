import { parseRefineCurationResponse } from "../../objects/curation/RefineCurationResponse";
import type { RefineCurationResponse } from "../../objects/curation/RefineCurationResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 RefineCurationMessage（POST /api/refinecuration）。 */
export class RefineCurationAPI {
  constructor(
    readonly exhibitionId: string,
    readonly instruction: string,
  ) {}

  send(): Promise<RefineCurationResponse> {
    return send(
      {
        routeName: apiName("RefineCurationAPI"),
        body: { exhibitionId: this.exhibitionId, instruction: this.instruction },
      },
      parseRefineCurationResponse,
    );
  }
}
