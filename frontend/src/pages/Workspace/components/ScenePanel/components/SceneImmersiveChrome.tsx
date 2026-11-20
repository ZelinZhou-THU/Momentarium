import type { RefObject } from "react";
import { Button } from "../../../../../components/ui";

/** 沉浸层右下角的"下一步"动作（如发布）：由页面按流程进度给出。 */
export interface SceneImmersiveAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface SceneImmersiveChromeProps {
  readonly title: string;
  readonly meta: string;
  readonly exitButtonRef: RefObject<HTMLButtonElement | null>;
  readonly nextAction: SceneImmersiveAction | null;
  readonly onExit: () => void;
  readonly onRegenerate: () => void;
}

/**
 * 沉浸观看的覆盖层：顶部返回 + 标题 + 场景说明，底部操作提示 + 重新生成 / 下一步。
 * 只有按钮接收指针，其余区域把拖动、滚轮留给场景。
 */
export function SceneImmersiveChrome({
  title,
  meta,
  exitButtonRef,
  nextAction,
  onExit,
  onRegenerate,
}: SceneImmersiveChromeProps) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
      <header className="flex items-start justify-between gap-4 bg-gradient-to-b from-night/85 to-transparent px-6 pb-12 pt-5">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            ref={exitButtonRef}
            variant="inverse"
            size="sm"
            className="pointer-events-auto shrink-0"
            onClick={onExit}
          >
            ← 返回工作台
          </Button>
          <p className="min-w-0 truncate font-serif text-h2 text-surface">{title}</p>
        </div>
        <p className="shrink-0 pt-2 text-micro text-surface/70">{meta}</p>
      </header>
      <footer className="flex flex-wrap items-end justify-between gap-4 bg-gradient-to-t from-night/85 to-transparent px-6 pb-5 pt-12">
        <p className="text-micro text-surface/60">拖动旋转 · 滚轮缩放 · Esc 退出</p>
        <div className="pointer-events-auto flex items-center gap-3">
          <Button variant="inverse" size="sm" onClick={onRegenerate}>
            重新生成
          </Button>
          {nextAction === null ? null : (
            <Button variant="inversePrimary" size="sm" onClick={nextAction.onSelect}>
              {nextAction.label}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
