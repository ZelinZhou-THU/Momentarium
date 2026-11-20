import { ConfirmDialog } from "../../../components/ui";
import type { SceneRunSummary } from "../../../objects/scene/SceneRunSummary";

export interface RestoreDialogProps {
  readonly run: SceneRunSummary | null;
  readonly restoring: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** 恢复确认：素材已变化时明确告知「这是按较早的照片或策展生成的场景」。 */
export function RestoreDialog({ run, restoring, onConfirm, onCancel }: RestoreDialogProps) {
  const message =
    run === null
      ? ""
      : run.matchesCurrentDraft
        ? "恢复后它会成为当前场景，发布时使用它；现有版本仍保留在历史中。"
        : "这个版本是按较早的照片或策展生成的，和现在的内容可能不完全对应。恢复后它会成为当前场景，现有版本仍保留在历史中。";
  return (
    <ConfirmDialog
      open={run !== null}
      title="恢复这个场景版本？"
      message={message}
      confirmLabel="恢复为当前场景"
      loading={restoring}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
