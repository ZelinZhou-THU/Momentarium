/** 展示用的五维评分中文名（spec §9.5 rubric）。 */
export const RUBRIC_LABELS = [
  { key: "moodMatch", label: "情绪契合", weight: 0.3 },
  { key: "photoPresence", label: "照片呈现", weight: 0.25 },
  { key: "composition", label: "空间构图", weight: 0.2 },
  { key: "lightingColor", label: "光影色彩", weight: 0.15 },
  { key: "completeness", label: "完成度", weight: 0.1 },
] as const;
