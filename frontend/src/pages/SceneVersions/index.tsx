import { useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { describeApiError } from "../../apis/shared/describeApiError";
import { AcceptSceneRunAPI } from "../../apis/scene/AcceptSceneRunAPI";
import { RestoreSceneRunAPI } from "../../apis/scene/RestoreSceneRunAPI";
import { AppTopBar } from "../../components/AppTopBar";
import { ErrorState, Reveal, Spinner, Toast } from "../../components/ui";
import type { SceneRunSummary } from "../../objects/scene/SceneRunSummary";
import { RestoreDialog } from "./components/RestoreDialog";
import { RunDetail } from "./components/RunDetail";
import { RunList } from "./components/RunList";
import { effectiveSelection } from "./functions/buildVersionsListState";
import { useSceneRunHistory } from "./hooks/useSceneRunHistory";
import { usePreviewPhotos } from "./hooks/usePreviewPhotos";
import { useSceneRunPreview } from "./hooks/useSceneRunPreview";

const RESTORE_ERRORS = {
  SCENE_RUN_ACTIVE: "有场景正在生成，请等它结束或停止后再恢复。",
  SCENE_RUN_NOT_RESTORABLE: "这个版本无法恢复（未成功或运行时已更新）。",
} as const;

const ACCEPT_ERRORS = {
  SCENE_RUN_ACTIVE: "有场景正在生成，请等它结束或停止后再采用。",
  SCENE_RUN_NOT_ACCEPTABLE: "这次运行不是可采用的修订候选，或父版本已不是当前场景。",
  SCENE_REVISION_STALE: "当前场景或素材已经变化，这个修订候选已无法采用；请刷新后重新修订。",
} as const;

/** 恢复动作：确认弹窗与执行中共享同一个目标，避免目标与 loading 布尔值脱节。 */
type RestoreAction =
  | { readonly status: "idle" }
  | { readonly status: "confirming"; readonly target: SceneRunSummary }
  | { readonly status: "restoring"; readonly target: SceneRunSummary };

/** 采用动作：同一时间只允许一个候选在执行；失败信息与候选 runId 绑定。 */
type AcceptAction =
  | { readonly status: "idle" }
  | { readonly status: "accepting"; readonly runId: string }
  | { readonly status: "failed"; readonly runId: string; readonly message: string };

/** 场景版本历史：左栏全部运行，右栏预览与评审，可把旧的成功版本恢复为当前场景。 */
export default function SceneVersionsPage() {
  const { id } = useParams<{ id: string }>();
  return id === undefined ? <Navigate to="/exhibitions" replace /> : <SceneVersionsContent exhibitionId={id} />;
}

function SceneVersionsContent({ exhibitionId }: { readonly exhibitionId: string }) {
  const { listState, reload } = useSceneRunHistory(exhibitionId);
  const runs = useMemo(() => (listState.status === "ready" ? listState.runs : []), [listState]);
  const [chosenRunId, setChosenRunId] = useState<string | null>(null);
  const [restoreAction, setRestoreAction] = useState<RestoreAction>({ status: "idle" });
  const [acceptAction, setAcceptAction] = useState<AcceptAction>({ status: "idle" });
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const selectedRunId = effectiveSelection(runs, chosenRunId);
  const preview = useSceneRunPreview(selectedRunId);
  const previewPhotos = usePreviewPhotos(exhibitionId);
  const selected = runs.find((run) => run.runId === selectedRunId) ?? null;

  const confirmRestore = (): void => {
    if (restoreAction.status === "idle") {
      return;
    }
    const target = restoreAction.target;
    setRestoreAction({ status: "restoring", target });
    new RestoreSceneRunAPI(target.runId)
      .send()
      .then(
        (restored) => {
          setRestoreAction({ status: "idle" });
          setChosenRunId(restored.runId);
          setToastMessage("已恢复为当前场景");
          reload();
        },
        (error: unknown) => {
          setRestoreAction({ status: "idle" });
          setToastMessage(describeApiError(error, RESTORE_ERRORS));
        },
      );
  };

  const confirmAccept = (): void => {
    if (selected === null || !selected.acceptable || acceptAction.status === "accepting") {
      return;
    }
    const runId = selected.runId;
    setAcceptAction({ status: "accepting", runId });
    new AcceptSceneRunAPI(runId).send().then(
      (accepted) => {
        setAcceptAction({ status: "idle" });
        setChosenRunId(accepted.runId);
        setToastMessage("已采用这次修订；公开页需要重新发布后才会变化。");
        reload();
      },
      (error: unknown) => {
        setAcceptAction({
          status: "failed",
          runId,
          message: describeApiError(error, ACCEPT_ERRORS),
        });
      },
    );
  };

  return (
    <div className="min-h-screen bg-bg">
      <AppTopBar>
        <Link viewTransition className="text-caption text-surface/70 transition-colors duration-150 ease-out hover:text-surface motion-reduce:transition-none" to={`/exhibitions/${exhibitionId}?tab=scene`}>
          ← 返回工作台
        </Link>
      </AppTopBar>

      <main className="mx-auto w-full max-w-content px-8 py-12">
        <Reveal>
          <h1 className="font-serif text-display text-ink">场景版本</h1>
          <p className="mt-2 text-body text-muted">
            每次生成都会留下一条记录。可以回看评审意见，也可以把更满意的旧版本恢复为当前场景。
          </p>
        </Reveal>

        <div className="mt-8">
          {listState.status === "loading" ? (
            <div className="flex justify-center py-24">
              <Spinner label="正在加载场景版本" />
            </div>
          ) : listState.status === "error" ? (
            <ErrorState message={listState.message} onRetry={reload} />
          ) : listState.status === "empty" ? (
            <p className="text-body text-muted">还没有生成过场景。回到工作台的「三维场景」分区开始生成。</p>
          ) : (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <RunList
                runs={runs}
                selectedRunId={selectedRunId}
                onSelect={(runId) => {
                  setChosenRunId(runId);
                  setAcceptAction({ status: "idle" });
                }}
              />
              <div className="lg:col-span-2">
                {selected === null ? null : (
                  <Reveal key={selected.runId} index={1}>
                    <RunDetail
                      summary={selected}
                      preview={preview}
                      photos={previewPhotos}
                      onRestore={() => setRestoreAction({ status: "confirming", target: selected })}
                      onAccept={confirmAccept}
                      accepting={
                        acceptAction.status === "accepting" && acceptAction.runId === selected.runId
                      }
                      acceptError={
                        acceptAction.status === "failed" && acceptAction.runId === selected.runId
                          ? acceptAction.message
                          : null
                      }
                    />
                  </Reveal>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      <RestoreDialog
        run={restoreAction.status === "idle" ? null : restoreAction.target}
        restoring={restoreAction.status === "restoring"}
        onConfirm={confirmRestore}
        onCancel={() => setRestoreAction({ status: "idle" })}
      />
      {toastMessage === null ? null : (
        <Toast message={toastMessage} tone="info" onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
}
