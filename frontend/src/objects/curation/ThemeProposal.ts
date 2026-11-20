import { requireArray, requireObject, requireString } from "../../apis/shared/decode";

/** 契约 §3.1 ProposalGroup(title, photoIds)：主题提案里的章节（仅引用照片 id）。 */
export interface ProposalGroup {
  readonly title: string;
  readonly photoIds: readonly string[];
}

export const parseProposalGroup = (value: unknown, path = "proposalGroup"): ProposalGroup => {
  const record = requireObject(value, path);
  return {
    title: requireString(record.title, `${path}.title`),
    photoIds: requireArray(record.photoIds, `${path}.photoIds`).map((photoId, index) =>
      requireString(photoId, `${path}.photoIds[${index}]`),
    ),
  };
};

/** 契约 §3.1 ThemeProposal(name, concept, groups)：suggestthemes 的单个提案。 */
export interface ThemeProposal {
  readonly name: string;
  readonly concept: string;
  readonly groups: readonly ProposalGroup[];
}

export const parseThemeProposal = (value: unknown, path = "themeProposal"): ThemeProposal => {
  const record = requireObject(value, path);
  return {
    name: requireString(record.name, `${path}.name`),
    concept: requireString(record.concept, `${path}.concept`),
    groups: requireArray(record.groups, `${path}.groups`).map((group, index) =>
      parseProposalGroup(group, `${path}.groups[${index}]`),
    ),
  };
};
