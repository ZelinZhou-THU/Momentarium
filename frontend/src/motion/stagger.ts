/** 列表逐项进场的间隔与上限：前几项错开出现，长列表不会让后面的项等太久。 */
const STAGGER_STEP_MS = 40;
const STAGGER_MAX_MS = 320;

/** 第 index 项（从 0 开始）的进场延迟，作为 animation-delay 使用。 */
export const staggerDelay = (index: number): string => `${Math.min(index * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`;
