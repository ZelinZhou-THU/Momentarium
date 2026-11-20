import { requireObject, requireString } from "../../apis/shared/decode";
import { parseCurationProposal } from "./CurationProposal";
import type { CurationProposal } from "./CurationProposal";

/** 契约 §3.1 RefineCurationResponse(reply, proposal)：refinecuration 的响应。 */
export interface RefineCurationResponse {
  readonly reply: string;
  readonly proposal: CurationProposal;
}

export const parseRefineCurationResponse = (
  value: unknown,
  path = "refineCuration",
): RefineCurationResponse => {
  const record = requireObject(value, path);
  return {
    reply: requireString(record.reply, `${path}.reply`),
    proposal: parseCurationProposal(record.proposal, `${path}.proposal`),
  };
};
