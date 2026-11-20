/**
 * 共享元素的 view-transition-name：同一时刻必须唯一，切换前后同名的元素会被补间。
 * 只用于页面内的状态切换（先导页 ↔ 场景、缩略图 ↔ 大图）：跨页面跳转时目标页面先进入加载态，
 * 切换瞬间没有同名元素可以补间。
 * 名字只由领域 id 组成（uuid 允许出现在名字中段），每类元素一个前缀。
 */
export const photoTransitionName = (photoId: string): string => `photo-${photoId}`;

/** 顶栏：页面切换时保持不动，不参与整页的交叉渐变。每个页面只有一个顶栏。 */
export const TOP_BAR_TRANSITION_NAME = "top-bar";

/**
 * 分区栏的当前项底板：切换分区时滑到新位置。
 * 参与过渡的命名元素会被提到整页画面之上，所以每个分区的文字也要有自己的名字，
 * 才能画在底板上面，否则底板滑动期间会把文字盖住。
 */
export const TAB_INDICATOR_TRANSITION_NAME = "tab-indicator";

export const tabLabelTransitionName = (tabId: string): string => `tab-label-${tabId}`;
