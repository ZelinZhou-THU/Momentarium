import { Button } from "../../../components/ui";
import type { WorkspaceNextStep } from "../functions/buildWorkspaceNextStep";
import { findWorkspaceTabLabel } from "../functions/workspaceTabs";

export interface NextStepHintProps {
  readonly nextStep: WorkspaceNextStep;
  /** 用户已经在下一步所在的位置（对应分区；需要 AI 灵感时面板也已打开）。 */
  readonly isAtTarget: boolean;
  readonly onGo: () => void;
}

/** 页头右侧"下一步"深色卡片（首屏的视觉重心）：说明当前该做什么；不在对应位置时给出跳转按钮。 */
export function NextStepHint({ nextStep, isAtTarget, onGo }: NextStepHintProps) {
  const showGo = !nextStep.done && !isAtTarget;

  return (
    <section
      aria-label="下一步"
      className="flex max-w-md items-center gap-4 rounded-xl bg-night px-5 py-4 shadow-sm"
    >
      <div className="min-w-0">
        <p className="text-micro text-surface/60">{nextStep.done ? "当前状态" : "下一步"}</p>
        <p className={nextStep.done ? "mt-1 text-body text-surface" : "mt-1 text-body text-accentSoft"}>
          {nextStep.title}
        </p>
        <p className="mt-1 text-caption text-surface/60">{nextStep.message}</p>
      </div>
      {showGo ? (
        <Button
          variant="inversePrimary"
          size="sm"
          className="shrink-0"
          onClick={onGo}
        >
          {nextStep.openInspiration ? "展开 AI 灵感" : `前往${findWorkspaceTabLabel(nextStep.tab)}`}
        </Button>
      ) : null}
    </section>
  );
}
