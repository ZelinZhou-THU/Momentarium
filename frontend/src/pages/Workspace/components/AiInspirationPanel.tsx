import { useState } from "react";
import type { KeyboardEvent } from "react";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { describeInspirationStatus } from "../functions/describeInspirationStatus";
import type { ThemeRequestPhase } from "../functions/describeInspirationStatus";
import { draftGroupsFromGroupInputs } from "../functions/draftGroupsFromGroupInputs";
import type { CurationDraftGroup } from "../objects/CurationDraft";
import { ChatPanel } from "./ChatPanel";
import { ThemePanel } from "./ThemePanel";

export interface AiInspirationPanelProps {
  readonly expanded: boolean;
  readonly exhibition: ExhibitionDetail;
  readonly onApplyGroups: (groups: readonly CurationDraftGroup[], sourceLabel: string) => void;
  readonly onExpandedChange: (expanded: boolean) => void;
}

/**
 * 悬浮在策展上的「AI 灵感」：收起时是右下角一张小卡片（显示当前状态），展开后原地变成
 * 可滚动的悬浮面板，不改变策展版面；收起只隐藏内容，提案与对话输入都保留。
 * 跟随策展分区显示（分区隐藏时一起隐藏），位置在底部保存栏之上。
 */
export function AiInspirationPanel({
  expanded,
  exhibition,
  onApplyGroups,
  onExpandedChange,
}: AiInspirationPanelProps) {
  const [phase, setPhase] = useState<ThemeRequestPhase>({ status: "idle" });

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === "Escape" && expanded) {
      event.stopPropagation();
      onExpandedChange(false);
    }
  };

  return (
    <aside
      aria-label="AI 灵感"
      onKeyDown={handleKeyDown}
      className={`fixed bottom-24 left-4 right-4 z-30 flex flex-col overflow-hidden rounded-xl border border-accent/20 bg-accentSoft shadow-sm sm:left-auto sm:right-6 sm:w-full ${
        expanded ? "sm:max-w-md" : "sm:max-w-xs"
      }`}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls="ai-inspiration-body"
        onClick={() => onExpandedChange(!expanded)}
        className="flex items-center justify-between gap-4 px-5 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface/40 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="min-w-0">
          <span className="block font-serif text-h2 text-ink">AI 灵感</span>
          <span className="block truncate text-caption text-muted">{describeInspirationStatus(phase)}</span>
        </span>
        <span className="shrink-0 rounded-md bg-surface px-3 py-1 text-caption text-accent">
          {expanded ? "收起" : "展开"}
        </span>
      </button>
      <div
        id="ai-inspiration-body"
        hidden={!expanded}
        className="max-h-[60vh] overflow-y-auto border-t border-accent/20 p-4"
      >
        <div className="flex flex-col gap-4">
          <ThemePanel exhibition={exhibition} onApplyGroups={onApplyGroups} onPhaseChange={setPhase} />
          <ChatPanel
            exhibition={exhibition}
            onApplyProposalGroups={(groups) =>
              onApplyGroups(draftGroupsFromGroupInputs(groups), "策展助手的提案")
            }
          />
        </div>
      </div>
    </aside>
  );
}
