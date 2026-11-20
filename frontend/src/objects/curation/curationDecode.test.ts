import { describe, expect, it } from "vitest";
import { DecodeError } from "../../apis/shared/decode";
import { parseChatHistoryResponse } from "./ChatHistoryResponse";
import { parseRefineCurationResponse } from "./RefineCurationResponse";
import { parseThemeSuggestionsResponse } from "./ThemeSuggestionsResponse";

// 按 docs/api-contract.md §3 手写的契约形状样例（qa 的 docs/contracts/curation 落地后应保持一致）。
describe("curation 解码层", () => {
  it("解码 suggestthemes 响应（主题提案 + 分组照片 id）", () => {
    const response = parseThemeSuggestionsResponse({
      proposals: [
        {
          name: "雨后的海岸",
          concept: "以潮声与雾色串起海边记忆。",
          groups: [
            { title: "抵达海边", photoIds: ["p-1", "p-2"] },
            { title: "街巷回声", photoIds: ["p-3"] },
          ],
        },
      ],
    });

    expect(response.proposals[0]?.name).toBe("雨后的海岸");
    expect(response.proposals[0]?.groups[1]?.photoIds).toEqual(["p-3"]);
  });

  it("解码 refinecuration 响应（回复 + CurationProposal）", () => {
    const response = parseRefineCurationResponse({
      reply: "我把雨天的照片提前，并给第二章换了标题。",
      proposal: {
        title: "济州岛的记忆",
        narrative: "一场雨与海风。",
        groups: [
          {
            title: "雨先落下",
            narrative: "第一组。",
            photos: [
              { photoId: "p-1", caption: "雨中的海岸" },
              { photoId: "p-2", caption: "" },
            ],
          },
        ],
      },
    });

    expect(response.proposal.groups[0]?.photos[1]?.caption).toBe("");
    expect(response.proposal.groups[0]?.photos).toHaveLength(2);
  });

  it("解码聊天历史（user / assistant）", () => {
    const response = parseChatHistoryResponse({
      messages: [
        { role: "user", content: "想更安静一点", createdAt: "2026-10-26T10:00:00Z" },
        { role: "assistant", content: "已调整章节顺序", createdAt: "2026-10-26T10:01:00Z" },
      ],
    });

    expect(response.messages[0]?.role).toBe("user");
    expect(response.messages[1]?.content).toBe("已调整章节顺序");
  });

  it("未声明的 role 视为契约违约", () => {
    expect(() =>
      parseChatHistoryResponse({
        messages: [{ role: "system", content: "x", createdAt: "2026-10-26T10:00:00Z" }],
      }),
    ).toThrow(DecodeError);
  });
});
