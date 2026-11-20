import { describe, expect, it } from "vitest";
import { describeAppliedProposalNotice, describeInspirationStatus } from "./describeInspirationStatus";

describe("AI 灵感收起时的状态", () => {
  it("按主题提案请求阶段给出一行摘要", () => {
    expect(describeInspirationStatus({ status: "idle" })).toContain("章节方向");
    expect(describeInspirationStatus({ status: "loading" })).toBe("正在生成主题提案…");
    expect(describeInspirationStatus({ status: "ready", proposalCount: 3 })).toBe("已生成 3 个主题提案");
    expect(describeInspirationStatus({ status: "ready", proposalCount: 0 })).toContain("没有得到提案");
    expect(describeInspirationStatus({ status: "failed" })).toContain("重试");
  });

  it("应用提示写明来源、章节数与下一步", () => {
    expect(describeAppliedProposalNotice("主题提案「另一种光」", 2)).toBe(
      "已填入主题提案「另一种光」（2 个章节）。检查后在底部保存，或用「撤销修改」回到上次保存的版本。",
    );
  });
});
