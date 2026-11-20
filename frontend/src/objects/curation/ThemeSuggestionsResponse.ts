import { requireArray, requireObject } from "../../apis/shared/decode";
import { parseThemeProposal } from "./ThemeProposal";
import type { ThemeProposal } from "./ThemeProposal";

/** 契约 §3.1 ThemeSuggestionsResponse(proposals)：suggestthemes 的响应。 */
export interface ThemeSuggestionsResponse {
  readonly proposals: readonly ThemeProposal[];
}

export const parseThemeSuggestionsResponse = (
  value: unknown,
  path = "themeSuggestions",
): ThemeSuggestionsResponse => {
  const record = requireObject(value, path);
  return {
    proposals: requireArray(record.proposals, `${path}.proposals`).map((proposal, index) =>
      parseThemeProposal(proposal, `${path}.proposals[${index}]`),
    ),
  };
};
