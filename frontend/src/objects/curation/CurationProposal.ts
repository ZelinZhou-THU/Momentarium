import { requireArray, requireObject, requireString } from "../../apis/shared/decode";
import { parseGroupInput } from "../gallery/GroupInput";
import type { GroupInput } from "../gallery/GroupInput";

/** 契约 §3.1 CurationProposal(title, narrative, groups)：refinecuration 的策展提案。 */
export interface CurationProposal {
  readonly title: string;
  readonly narrative: string;
  readonly groups: readonly GroupInput[];
}

export const parseCurationProposal = (
  value: unknown,
  path = "curationProposal",
): CurationProposal => {
  const record = requireObject(value, path);
  return {
    title: requireString(record.title, `${path}.title`),
    narrative: requireString(record.narrative, `${path}.narrative`),
    groups: requireArray(record.groups, `${path}.groups`).map((group, index) =>
      parseGroupInput(group, `${path}.groups[${index}]`),
    ),
  };
};
