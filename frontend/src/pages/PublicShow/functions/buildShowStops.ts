import type { ShowStop } from "../objects/ShowStop";
import type { PublicExhibitionView, PublicPhotoView } from "./publicShowDtos";

const chapterEyebrow = (index: number, title: string): string =>
  title.trim() === "" ? `第 ${index + 1} 章` : `第 ${index + 1} 章 · ${title}`;

const firstNonBlank = (candidates: readonly string[]): string =>
  candidates.find((text) => text.trim() !== "")?.trim() ?? "";

/** 侧栏缩略图下的一行字：优先 AI 配文（为增强氛围而写），没有时用作者图注。 */
export const photoLineOf = (photo: PublicPhotoView): string =>
  firstNonBlank([photo.reading?.poeticLine ?? "", photo.caption]);

const stopOf = (photo: PublicPhotoView, eyebrow: string | null, chapterNarrative: string): ShowStop => {
  const poeticLine = photo.reading?.poeticLine ?? "";
  const words = firstNonBlank([photo.caption, poeticLine, chapterNarrative]);
  const echoes = [poeticLine, photo.reading?.sensory ?? ""]
    .map((text) => text.trim())
    .filter((text, index, all) => text !== "" && text !== words && all.indexOf(text) === index);
  return { photo, eyebrow, words, echoes, palette: photo.reading?.palette ?? [] };
};

/**
 * 把展览整理成按叙事顺序排列的导览站点：先按章节顺序列出章节内的照片，
 * 再补上不属于任何章节、但在场景里出现的照片（点击场景里的照片也能找到它）。
 */
export const buildShowStops = (
  exhibition: Pick<PublicExhibitionView, "groups" | "photos">,
): readonly ShowStop[] => {
  const chapterStops = exhibition.groups.flatMap((group, index) =>
    group.photos.map((photo) => stopOf(photo, chapterEyebrow(index, group.title), group.narrative)),
  );
  const placed = new Set(chapterStops.map((stop) => stop.photo.id));
  const looseStops = exhibition.photos.filter((photo) => !placed.has(photo.id)).map((photo) => stopOf(photo, null, ""));
  return [...chapterStops, ...looseStops];
};

/** 场景里点击的照片在导览中的位置；不存在时为 null。 */
export const findStopIndex = (stops: readonly ShowStop[], photoId: string): number | null => {
  const index = stops.findIndex((stop) => stop.photo.id === photoId);
  return index < 0 ? null : index;
};
