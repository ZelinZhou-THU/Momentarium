import { describe, expect, it } from "vitest";
import { DecodeError } from "../../../apis/shared/decode";
import {
  parsePublicExhibitionView,
  parsePublicGroupView,
  parsePublicPhotoView,
  parsePublishedSceneResponse,
} from "./publicShowDtos";
import { createPublicExhibitionFixture, createPublishedSceneFixture } from "../mocks/publicShowFixtures";
import { PUBLISHED_SCENE_WIRE_FIXTURE } from "../mocks/publishedSceneWire.fixture";

describe("公开展览视图解码（api-contract §2.1 PublicExhibitionView）", () => {
  it("解码本地 fixture 并保留章节/照片/封面字段", () => {
    const decoded = parsePublicExhibitionView(createPublicExhibitionFixture());
    expect(decoded.title).toBe("济州岛的海与山");
    expect(decoded.version).toBe(2);
    expect(decoded.groups).toHaveLength(2);
    expect(decoded.photos).toHaveLength(3);
    expect(decoded.cover.kind).toBe("photo");
    expect(decoded.groups[0].photos[0].caption).toBe("退潮后的黑色礁石");
    expect(decoded.photos[2].thumbUrl).toContain("variant=thumb");
  });

  it("拒绝缺失字段、非法封面 kind 与错类型", () => {
    const { narration, ...withoutNarration } = createPublicExhibitionFixture();
    expect(() => parsePublicExhibitionView(withoutNarration)).toThrow(DecodeError);
    expect(() => parsePublicExhibitionView({ ...createPublicExhibitionFixture(), cover: { kind: "unknown" } })).toThrow(
      DecodeError,
    );
    expect(() => parsePublicExhibitionView({ ...createPublicExhibitionFixture(), groups: [{}] })).toThrow(DecodeError);
    expect(() => parsePublicExhibitionView(null)).toThrow(DecodeError);
  });

  it("章节与照片解析可单独复用", () => {
    const group = createPublicExhibitionFixture().groups[1];
    expect(parsePublicGroupView(group).photos).toHaveLength(1);
    expect(parsePublicPhotoView(group.photos[0]).caption).toBe("山间的清晨薄雾");
  });
});

describe("公开场景工件解码（api-contract §4.2 PublishedSceneResponse）", () => {
  it("真实 wire：runtimeVersion 为字符串（spec §7 runtime_version text）也能解码", () => {
    const decoded = parsePublishedSceneResponse(PUBLISHED_SCENE_WIRE_FIXTURE);
    expect(decoded.runtimeVersion).toBe("1");
    expect(decoded.code).toContain("function build(ctx)");
    expect(decoded.code.length).toBeGreaterThan(500);
    expect(Number.isNaN(Date.parse(decoded.generatedAt))).toBe(false);
  });
  it("解码 code/runtimeVersion/generatedAt", () => {
    const decoded = parsePublishedSceneResponse(createPublishedSceneFixture());
    expect(decoded.runtimeVersion).toBe("1");
    expect(decoded.code).toContain("function build(ctx)");
    expect(decoded.generatedAt).toBe("2026-10-27T14:58:00Z");
  });

  it("拒绝空 code 与缺失字段", () => {
    expect(() => parsePublishedSceneResponse({ ...createPublishedSceneFixture(), code: 42 })).toThrow(DecodeError);
    expect(() => parsePublishedSceneResponse({ runtimeVersion: 1 })).toThrow(DecodeError);
  });
});
