/** 主题提案请求的阶段（ThemePanel 内部状态的摘要，供 AI 灵感收起时显示）。 */
export type ThemeRequestPhase =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "failed" }
  | { readonly status: "ready"; readonly proposalCount: number };

/** AI 灵感收起时的一行状态。 */
export const describeInspirationStatus = (phase: ThemeRequestPhase): string => {
  switch (phase.status) {
    case "idle":
      return "让 AI 给出章节方向，或用一句话让它改";
    case "loading":
      return "正在生成主题提案…";
    case "failed":
      return "主题提案没有生成成功，展开后可重试";
    case "ready":
      return phase.proposalCount === 0 ? "这次没有得到提案，可换个方向再试" : `已生成 ${phase.proposalCount} 个主题提案`;
  }
};

/** 应用 AI 提案后，策展顶部的提示。 */
export const describeAppliedProposalNotice = (sourceLabel: string, groupCount: number): string =>
  `已填入${sourceLabel}（${groupCount} 个章节）。检查后在底部保存，或用「撤销修改」回到上次保存的版本。`;
