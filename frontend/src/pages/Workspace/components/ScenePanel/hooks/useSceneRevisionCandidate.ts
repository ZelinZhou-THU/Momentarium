import { useState } from "react";
import { AcceptSceneRunAPI } from "../../../../../apis/scene/AcceptSceneRunAPI";
import { DismissSceneRunAPI } from "../../../../../apis/scene/DismissSceneRunAPI";
import { ReviseSceneAPI } from "../../../../../apis/scene/ReviseSceneAPI";
import type { SceneRunView } from "../../../../../objects/gallery/SceneRunView";
import { describeSceneError } from "../../../../../scene/functions/describeSceneError";
import { explainRevisionBlocked, validateSceneInstruction } from "../functions/sceneRevision";

export interface SceneRevisionCandidateModel {
  readonly candidateRun: SceneRunView | null;
  readonly dismissedCandidateId: string | null;
  readonly revisionInstruction: string;
  readonly revisionPending: boolean;
  readonly revisionError: string | null;
  readonly canRevise: boolean;
  readonly revisionDisabledReason: string | null;
  readonly acceptingCandidate: boolean;
  readonly acceptError: string | null;
  updateInstruction(instruction: string): void;
  revise(): void;
  acceptCandidate(): void;
  dismissCandidate(): void;
}

export interface SceneRevisionCandidateOptions {
  /** 当前采用场景（修订基线）；null 表示还没有可修订场景。 */
  readonly currentRun: SceneRunView | null;
  /** 最新运行；未采用修订候选从它识别。 */
  readonly run: SceneRunView | null;
  readonly isActionPending: boolean;
  readonly hasActiveRun: boolean;
  /** 当前场景已过期：后端会以 SCENE_REVISION_STALE 拒绝修订，前端提前禁用并说明。 */
  readonly sceneStale: boolean;
  readonly reloadRun: () => void;
  readonly onRunChanged?: (run: SceneRunView) => void;
  readonly setSceneNotice: (message: string | null) => void;
  readonly dismissedCandidateId: string | null;
  readonly setDismissedCandidateId: (id: string | null) => void;
}

/**
 * 场景修订与候选采用的状态编排：
 * - 修订从当前采用场景出发；提交后只是候选，不自动改变当前场景；
 * - 放弃和采用均保存到服务端，成功后刷新运行并通知页面。
 */
export const useSceneRevisionCandidate = ({
  currentRun,
  run,
  isActionPending,
  hasActiveRun,
  sceneStale,
  reloadRun,
  onRunChanged,
  setSceneNotice,
  dismissedCandidateId,
  setDismissedCandidateId,
}: SceneRevisionCandidateOptions): SceneRevisionCandidateModel => {
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionPending, setRevisionPending] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [acceptingCandidate, setAcceptingCandidate] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  /** 最新运行中的未采用修订候选（不等于当前场景）；放弃后不再作为预览。 */
  const candidateRun =
    run !== null &&
    run.kind === "revise" &&
    run.status === "succeeded" &&
    !run.isCurrent &&
    !run.dismissed &&
    run.runId !== dismissedCandidateId
      ? run
      : null;

  const instructionValidation = validateSceneInstruction(revisionInstruction);
  const canRevise =
    currentRun !== null &&
    currentRun.status === "succeeded" &&
    currentRun.code !== null &&
    instructionValidation.ok &&
    !revisionPending &&
    !isActionPending &&
    !hasActiveRun &&
    !sceneStale;
  const revisionDisabledReason = explainRevisionBlocked({ currentRun, hasActiveRun, sceneStale });

  const updateInstruction = (instruction: string): void => {
    setRevisionInstruction(instruction);
    setRevisionError(null);
  };

  const revise = (): void => {
    if (currentRun === null) {
      return;
    }
    const validation = validateSceneInstruction(revisionInstruction);
    if (!validation.ok) {
      setRevisionError(validation.message);
      return;
    }
    setRevisionPending(true);
    setRevisionError(null);
    setAcceptError(null);
    setSceneNotice(null);
    new ReviseSceneAPI(currentRun.runId, validation.instruction).send().then(
      (revised) => {
        setRevisionPending(false);
        setSceneNotice("修订任务已提交；生成完成后会显示候选，不会自动改变当前场景。");
        reloadRun();
        onRunChanged?.(revised);
      },
      (error: unknown) => {
        setRevisionPending(false);
        setRevisionError(describeSceneError(error));
      },
    );
  };

  const acceptCandidate = (): void => {
    if (candidateRun === null) {
      return;
    }
    setAcceptingCandidate(true);
    setAcceptError(null);
    setSceneNotice(null);
    new AcceptSceneRunAPI(candidateRun.runId).send().then(
      (accepted) => {
        setAcceptingCandidate(false);
        setDismissedCandidateId(null);
        setSceneNotice("已采用这次修订；公开页需要重新发布后才会变化。");
        reloadRun();
        onRunChanged?.(accepted);
      },
      (error: unknown) => {
        setAcceptingCandidate(false);
        setAcceptError(describeSceneError(error));
      },
    );
  };

  const dismissCandidate = (): void => {
    if (candidateRun === null || acceptingCandidate) {
      return;
    }
    setAcceptingCandidate(true);
    setAcceptError(null);
    new DismissSceneRunAPI(candidateRun.runId).send().then(
      (dismissed) => {
        setAcceptingCandidate(false);
        setDismissedCandidateId(dismissed.runId);
        setSceneNotice("已放弃这次修订候选；当前场景没有改变。");
        reloadRun();
        onRunChanged?.(dismissed);
      },
      (error: unknown) => {
        setAcceptingCandidate(false);
        setAcceptError(describeSceneError(error));
      },
    );
  };

  return {
    candidateRun,
    dismissedCandidateId,
    revisionInstruction,
    revisionPending,
    revisionError,
    canRevise,
    revisionDisabledReason,
    acceptingCandidate,
    acceptError,
    updateInstruction,
    revise,
    acceptCandidate,
    dismissCandidate,
  };
};
