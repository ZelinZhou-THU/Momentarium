import type { ScenePanelState } from "../objects/ScenePanelState";

export interface SceneStageView {
  /** 阶段标题（用于 timeline 的当前步骤）。 */
  readonly title: string;
  /** 面向用户的说明/下一步提示。 */
  readonly description: string;
  /** 0 未开始、1 生成题面、2 写代码、3 渲染截图、4 评审、5 完成（timeline 高亮用）。 */
  readonly step: number;
}

const STAGE_DONE = 5;

/**
 * generating 的三个真实子阶段：后端写完题面就先落库（SC-03），所以 brief 为空 = 正在写题面；
 * 有 brief = 正在写代码；attempts > 0 = 按上一轮评审意见修订代码。
 */
const describeGenerating = (state: ScenePanelState): SceneStageView => {
  const run = state.run;
  if (run === null || run.brief === null) {
    return { title: "正在生成题面", description: "AI 正在阅读照片情绪并写场景题面。", step: 1 };
  }
  if (run.attempts > 0) {
    const issueCount = run.review?.issues.length ?? 0;
    const basis = issueCount > 0 ? `上一轮评审的 ${issueCount} 条意见` : "上一轮评审意见";
    return {
      title: `正在修订场景代码（第 ${run.attempts} 次）`,
      description: `子智能体正在按${basis}修改代码，改完会重新渲染、再评审一次。`,
      step: 2,
    };
  }
  return { title: "正在写场景代码", description: "题面已完成，子智能体正在编写 build(ctx) 场景代码，这一步通常最久。", step: 2 };
};

/**
 * 面板状态 → 阶段文案。generating 阶段区分题面 / 写代码 / 修订，
 * 让用户在长等待中知道进度（spec §11.5 生成期间展示阶段文案）。
 */
export const describeSceneStage = (state: ScenePanelState): SceneStageView => {
  switch (state.status) {
    case "loading":
      return { title: "正在读取场景状态", description: "加载当前展览最近一次场景运行。", step: 0 };
    case "idle":
      return { title: "尚未生成三维场景", description: "写一句氛围提示（可选），然后开始生成。", step: 0 };
    case "queued":
      return { title: "已排队", description: "等待生成任务开始，通常只需几秒。", step: 1 };
    case "generating":
      return describeGenerating(state);
    case "awaiting_capture":
      return { title: "等待渲染截图", description: "场景代码已就绪，沙箱正在准备四个环绕视角。", step: 3 };
    case "capturing":
      return { title: "正在渲染并截图", description: "沙箱渲染初始视角与环绕一圈的另外三个视角。", step: 3 };
    case "reviewing":
      return { title: "正在评审", description: "AI 评审正在对照题面给渲染结果打分。", step: 4 };
    case "succeeded":
      // UI-04：兜底工件是修订额度用尽的回退（保留最后一次未通过的评审），不能写"已通过评审"。
      return state.run?.source === "fallback"
        ? {
            title: "已回退兜底场景",
            description: "修订额度用尽仍未达到评审门槛，已回退到兜底场景展示；可重新生成。",
            step: STAGE_DONE,
          }
        : { title: "场景生成完成", description: "场景已通过评审，可预览或重新生成。", step: STAGE_DONE };
    case "failed":
      return {
        title: "场景生成失败",
        description: state.run?.errorMessage ?? state.message ?? "生成失败，可重试。",
        step: 0,
      };
    case "cancelled":
      return { title: "已停止生成", description: "已取消本次场景生成。", step: 0 };
    case "error":
      return { title: "场景操作失败", description: state.message ?? "请求失败，请稍后重试。", step: 0 };
  }
};
