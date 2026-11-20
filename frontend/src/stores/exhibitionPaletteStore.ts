import { create } from "zustand";

/**
 * 跨页面共享的展览场景主色（界面配色的来源）：展览列表、作者主页、工作台、看展页等拿到数据时登记，
 * 进入某个展览的页面时立即按它的主色上色——从列表点进来不会先闪一下默认配色。
 */
interface ExhibitionPaletteState {
  readonly palettes: Readonly<Record<string, readonly string[]>>;
}

/** 带场景主色的展览数据（ExhibitionSummary / ExhibitionDetail / PublicExhibitionView / AuthorExhibitionCard 都满足）。 */
export interface ExhibitionWithScenePalette {
  readonly id: string;
  readonly scenePalette: readonly string[];
}

// store 私有：外部只能通过本文件公开的语义化函数访问。
const exhibitionPaletteStore = create<ExhibitionPaletteState>(() => ({ palettes: {} }));

const samePalette = (first: readonly string[] | undefined, second: readonly string[]): boolean =>
  first !== undefined && first.length === second.length && first.every((color, index) => color === second[index]);

/** 某个展览已登记的场景主色；不在展览页面（id 为 null）或还没登记时为 null。 */
export const useRememberedExhibitionScenePalette = (exhibitionId: string | null): readonly string[] | null =>
  exhibitionPaletteStore((state) => (exhibitionId === null ? null : (state.palettes[exhibitionId] ?? null)));

/** 拿到展览数据时登记它们的场景主色；内容没变的条目不写入，避免无谓的重新上色。 */
export const rememberExhibitionScenePalettes = (exhibitions: readonly ExhibitionWithScenePalette[]): void => {
  const changed = exhibitions.filter(
    (exhibition) => !samePalette(exhibitionPaletteStore.getState().palettes[exhibition.id], exhibition.scenePalette),
  );
  if (changed.length === 0) return;
  exhibitionPaletteStore.setState((state) => ({
    palettes: {
      ...state.palettes,
      ...Object.fromEntries(changed.map((exhibition) => [exhibition.id, exhibition.scenePalette])),
    },
  }));
};
