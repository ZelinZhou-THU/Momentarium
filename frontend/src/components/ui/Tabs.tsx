import { useEffect, useRef } from "react";
import type { KeyboardEvent } from "react";
import { TAB_INDICATOR_TRANSITION_NAME, tabLabelTransitionName } from "../../motion/transitionNames";
import { classNames } from "./classNames";

export interface TabItem {
  readonly id: string;
  readonly label: string;
  /** 徽标文案（如照片数、章节数、已发布 vN）；空字符串不显示。 */
  readonly badge?: string;
  /** 需要提醒的小圆点（如未保存草稿、场景有新结果）。 */
  readonly dot?: boolean;
}

export type TabsNavigationKey = "ArrowLeft" | "ArrowRight" | "Home" | "End";

export interface TabsProps {
  readonly items: readonly TabItem[];
  readonly activeId: string;
  readonly onChange: (id: string) => void;
  /** tablist 的无障碍名称（如「工作台分区」）。 */
  readonly ariaLabel: string;
  readonly className?: string;
}


const NAVIGATION_KEYS: readonly TabsNavigationKey[] = [
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
];

const isNavigationKey = (key: string): key is TabsNavigationKey =>
  NAVIGATION_KEYS.some((candidate) => candidate === key);

/**
 * 键盘导航的纯函数：左右循环、Home/End 到首尾。
 * 找不到 activeId 时从第一项开始（容错，不抛错）。
 */
export const nextTabId = (
  items: readonly TabItem[],
  activeId: string,
  key: TabsNavigationKey,
): string | null => {
  if (items.length === 0) {
    return null;
  }
  const currentIndex = items.findIndex((item) => item.id === activeId);
  const baseIndex = currentIndex < 0 ? 0 : currentIndex;
  switch (key) {
    case "ArrowLeft":
      return items[(baseIndex - 1 + items.length) % items.length].id;
    case "ArrowRight":
      return items[(baseIndex + 1) % items.length].id;
    case "Home":
      return items[0].id;
    case "End":
      return items[items.length - 1].id;
  }
};

/**
 * 分 tab 原语（受控）：role=tablist/tab + aria-selected、当前项为深色填充标签、badge/dot 插槽、
 * 左右方向键循环 / Home / End 键盘切换。窄屏可横向滚动，不换行、不新增颜色。
 * 当前项的深色底板是独立的一层（带共享名字），切换分区时由页面的 View Transition 让它滑到新位置；
 * 每项的文字内容也各有名字，过渡期间才会画在滑动的底板之上。底板用负 z-index 并且按钮不单独成层，
 * 这样底板在整条分区栏里始终排在所有文字之下，无论从哪个分区滑向哪个分区，叠放顺序都一致。
 */
export function Tabs({ items, activeId, onChange, ariaLabel, className }: TabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // 窄屏分区栏可横向滚动：当前分区（含深链接直达）被挤到可视区外时，只在栏内滚到可见，不带动整页滚动。
  useEffect(() => {
    tabRefs.current[activeId]?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!isNavigationKey(event.key)) {
      return;
    }
    const nextId = nextTabId(items, activeId, event.key);
    if (nextId === null) {
      return;
    }
    event.preventDefault();
    onChange(nextId);
    tabRefs.current[nextId]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={classNames("flex h-14 items-center gap-2 overflow-x-auto", className)}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[item.id] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${item.id}`}
            aria-selected={isActive}
            aria-controls={`tabpanel-${item.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={handleKeyDown}
            className={classNames(
              "relative flex h-10 shrink-0 items-center gap-2 rounded-md px-4 text-caption transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
              isActive ? "text-surface" : "text-muted hover:bg-accentSoft hover:text-ink",
            )}
          >
            {isActive ? (
              <span
                aria-hidden="true"
                style={{ viewTransitionName: TAB_INDICATOR_TRANSITION_NAME }}
                className="absolute inset-0 -z-10 rounded-md bg-night"
              />
            ) : null}
            <span style={{ viewTransitionName: tabLabelTransitionName(item.id) }} className="flex items-center gap-2">
              <span>{item.label}</span>
              {item.badge === undefined || item.badge.length === 0 ? null : (
                <span
                  className={classNames(
                    "rounded-md px-2 py-1 text-micro",
                    isActive ? "bg-surface/15 text-surface" : "bg-accentSoft text-accent",
                  )}
                >
                  {item.badge}
                </span>
              )}
              {item.dot === true ? (
                <>
                  <span
                    aria-hidden="true"
                    className={classNames("h-1 w-1 rounded-md", isActive ? "bg-accentSoft" : "bg-accent")}
                  />
                  <span className="sr-only">有待处理的更新</span>
                </>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
