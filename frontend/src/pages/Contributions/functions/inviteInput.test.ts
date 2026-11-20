import { describe, expect, it } from "vitest";
import { inviteTokenFromInput } from "./inviteInput";

const TOKEN = "AAA-aaa_000".repeat(4).slice(0, 43);

describe("粘贴的邀请内容", () => {
  it("完整链接、站内路径、单独令牌都能取出令牌，前后空白被忽略", () => {
    expect(inviteTokenFromInput(`http://localhost:8095/invite/${TOKEN}`)).toBe(TOKEN);
    expect(inviteTokenFromInput(`  https://example.com/invite/${TOKEN}/  `)).toBe(TOKEN);
    expect(inviteTokenFromInput(`/invite/${TOKEN}?from=chat#x`)).toBe(TOKEN);
    expect(inviteTokenFromInput(`链接在这：https://example.com/invite/${TOKEN} 请查收`)).toBe(TOKEN);
    expect(inviteTokenFromInput(` ${TOKEN} `)).toBe(TOKEN);
  });

  it("百分号编码的令牌先解码", () => {
    expect(inviteTokenFromInput(`https://example.com/invite/${encodeURIComponent(TOKEN)}`)).toBe(TOKEN);
  });

  it("空内容、过短、含非法字符的输入识别不了", () => {
    expect(inviteTokenFromInput("")).toBeNull();
    expect(inviteTokenFromInput("   ")).toBeNull();
    expect(inviteTokenFromInput("abc")).toBeNull();
    expect(inviteTokenFromInput("https://example.com/show/abc")).toBeNull();
    expect(inviteTokenFromInput(`${TOKEN} 多余的字`)).toBeNull();
    expect(inviteTokenFromInput("https://example.com/invite/%%%")).toBeNull();
  });
});
