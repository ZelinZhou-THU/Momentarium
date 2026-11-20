import { parseThemeSuggestionsResponse } from "../../objects/curation/ThemeSuggestionsResponse";
import type { ThemeSuggestionsResponse } from "../../objects/curation/ThemeSuggestionsResponse";
import { apiName } from "../shared/apiName";
import { send } from "../shared/send";

/** 对应后端 SuggestThemesMessage（POST /api/suggestthemes）；hint 为 Option，按契约发 null。 */
export class SuggestThemesAPI {
  constructor(
    readonly exhibitionId: string,
    readonly hint: string | null,
  ) {}

  send(): Promise<ThemeSuggestionsResponse> {
    return send(
      { routeName: apiName("SuggestThemesAPI"), body: { exhibitionId: this.exhibitionId, hint: this.hint } },
      parseThemeSuggestionsResponse,
    );
  }
}
