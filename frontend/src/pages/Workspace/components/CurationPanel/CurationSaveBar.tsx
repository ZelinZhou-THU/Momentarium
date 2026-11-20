import { useState } from "react";
import { Button, ConfirmDialog } from "../../../../components/ui";
import type { CurationSaveState } from "../../objects/CurationDraft";

export interface CurationSaveBarProps {
  readonly isDirty: boolean;
  readonly saveState: CurationSaveState;
  readonly onSave: () => void;
  readonly onDiscard: () => void;
}

/** 策展底部吸附操作栏：滚到哪里都能看到保存状态、保存与撤销（撤销需二次确认）；有未保存修改时转为深色提醒。 */
export function CurationSaveBar({ isDirty, saveState, onSave, onDiscard }: CurationSaveBarProps) {
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const isSaving = saveState.status === "saving";

  return (
    <div
      className={`sticky bottom-0 z-10 -mx-6 -mb-6 mt-8 rounded-b-xl border-t px-6 py-4 transition-colors duration-200 ease-out motion-reduce:transition-none ${
        isDirty ? "border-night bg-night" : "border-line bg-surface"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="status">
          <p className={isDirty ? "text-caption text-accentSoft" : "text-caption text-muted"}>
            {isDirty ? "有未保存修改" : "所有修改已保存"}
          </p>
          {saveState.status === "failed" ? (
            <p role="alert" className={isDirty ? "mt-1 text-caption text-accentSoft" : "mt-1 text-caption text-danger"}>
              {saveState.message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={isDirty ? "inverse" : "ghost"}
            size="sm"
            disabled={!isDirty || isSaving}
            onClick={() => setIsConfirmingDiscard(true)}
          >
            撤销修改
          </Button>
          <Button
            variant={isDirty ? "inversePrimary" : "primary"}
            size="sm"
            loading={isSaving}
            disabled={!isDirty}
            onClick={onSave}
          >
            保存策展
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={isConfirmingDiscard}
        title="撤销全部未保存修改？"
        message="标题、叙事、章节与图注会回到上次保存的版本。"
        confirmLabel="撤销修改"
        cancelLabel="继续编辑"
        tone="danger"
        onConfirm={() => {
          setIsConfirmingDiscard(false);
          onDiscard();
        }}
        onCancel={() => setIsConfirmingDiscard(false)}
      />
    </div>
  );
}
