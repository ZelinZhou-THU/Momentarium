import { describe, expect, it } from "vitest";
import { createPublicExhibitionFixture, createPublicPhotoFixture } from "../mocks/publicShowFixtures";
import { buildShowStops, findStopIndex, photoLineOf } from "./buildShowStops";

describe("看展导览站点", () => {
  it("按章节顺序排列，带章节标签；图注为空时退回章节叙事", () => {
    const exhibition = createPublicExhibitionFixture();
    const blank = createPublicPhotoFixture("photo-blank", "  ");
    const stops = buildShowStops({
      photos: [exhibition.photos[0]!, blank, exhibition.photos[2]!],
      groups: [
        { ...exhibition.groups[0]!, photos: [exhibition.photos[0]!, blank] },
        exhibition.groups[1]!,
      ],
    });
    expect(stops.map((stop) => stop.photo.id)).toEqual(["photo-jeju-01", "photo-blank", "photo-jeju-03"]);
    expect(stops[0]).toMatchObject({ eyebrow: "第 1 章 · 退潮的礁石", words: "退潮后的黑色礁石" });
    expect(stops[1]?.words).toBe("海水退去后留下的黑色玄武岩。");
    expect(stops[2]?.eyebrow).toBe("第 2 章 · 远处的光");
  });

  it("不属于任何章节的场景照片排在最后，没有章节标签", () => {
    const exhibition = createPublicExhibitionFixture();
    const loose = createPublicPhotoFixture("photo-loose", "路边的一盏灯");
    const stops = buildShowStops({ ...exhibition, photos: [...exhibition.photos, loose] });
    expect(stops).toHaveLength(4);
    expect(stops[3]).toMatchObject({ eyebrow: null, words: "路边的一盏灯" });
    expect(findStopIndex(stops, "photo-loose")).toBe(3);
    expect(findStopIndex(stops, "missing")).toBeNull();
  });

  it("章节标题为空时只显示章节序号", () => {
    const exhibition = createPublicExhibitionFixture();
    const stops = buildShowStops({ ...exhibition, groups: [{ ...exhibition.groups[0]!, title: " " }] });
    expect(stops[0]?.eyebrow).toBe("第 1 章");
  });

  it("照片有 AI 解读时：主文字仍优先作者图注，AI 配文与感官描写作为补充，并带主色", () => {
    const reading = { palette: ["#1B2A4A", "#F2A65A"], poeticLine: "浪把黄昏揉碎在黑石上", sensory: "咸湿的风" };
    const withCaption = { ...createPublicPhotoFixture("photo-read", "退潮后的黑色礁石"), reading };
    const withoutCaption = { ...createPublicPhotoFixture("photo-quiet", ""), reading };
    const [first, second] = buildShowStops({
      photos: [withCaption, withoutCaption],
      groups: [{ id: "g", title: "退潮", narrative: "海水退去。", position: 0, photos: [withCaption, withoutCaption] }],
    });
    expect(first).toMatchObject({
      words: "退潮后的黑色礁石",
      echoes: ["浪把黄昏揉碎在黑石上", "咸湿的风"],
      palette: ["#1B2A4A", "#F2A65A"],
    });
    expect(second).toMatchObject({ words: "浪把黄昏揉碎在黑石上", echoes: ["咸湿的风"] });
  });

  it("没有 AI 解读时没有补充文字与主色", () => {
    const exhibition = createPublicExhibitionFixture();
    expect(buildShowStops(exhibition)[0]).toMatchObject({ echoes: [], palette: [] });
  });

  it("侧栏文字优先 AI 配文，没有时用作者图注", () => {
    const photo = createPublicPhotoFixture("photo-line", "黄昏时分的海面");
    expect(photoLineOf(photo)).toBe("黄昏时分的海面");
    expect(photoLineOf({ ...photo, reading: { palette: [], poeticLine: "光停在海面上", sensory: "" } })).toBe("光停在海面上");
  });
});
