import { useEffect, useRef, useState } from "react";
import { describeGalleryError } from "../../../../../apis/gallery/describeGalleryError";
import { createCaptureRequest } from "../../../../../scene/capture";
import { CAPTURE_TIMEOUT_MS } from "../../../../../scene/contract";
import type { CaptureRequestMessage, CapturesMessage, ImageCapture } from "../../../../../scene/contract";
import { matchesCoverRequest } from "../functions/coverCaptureGuard";
import type { SceneSandboxFailure } from "../../../../../scene/sandbox";

export interface SceneCoverStatus {
  readonly status: "idle" | "capturing" | "saving" | "success" | "error";
  readonly message?: string;
}

export interface SceneCoverCaptureController {
  readonly builtRunId: string | null;
  readonly coverRequest: CaptureRequestMessage | null;
  readonly coverStatus: SceneCoverStatus;
  setBuiltRunId(runId: string): void;
  requestCover(): void;
  cancel(): void;
  handleCaptured(message: CapturesMessage): boolean;
  handleFailure(failure: SceneSandboxFailure): void;
}

export function useSceneCoverCapture(
  runId: string | undefined,
  actionPending: boolean,
  onSaveSceneCover?: (runId: string, capture: ImageCapture) => Promise<void>,
  onCancelSceneCover?: () => void,
): SceneCoverCaptureController {
  const [builtRunId, setBuiltRunId] = useState<string | null>(null);
  const [coverRequest, setCoverRequest] = useState<CaptureRequestMessage | null>(null);
  const [coverStatus, setCoverStatus] = useState<SceneCoverStatus>({ status: "idle" });
  const savingCover = useRef(false);
  const generationBlocked = useRef(false);
  useEffect(() => {
    if (!actionPending) generationBlocked.current = false;
  }, [actionPending]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const pendingCover = useRef<{ runId: string; requestId: string; timer: number } | null>(null);
  const coverSequence = useRef(0);
  const saveGeneration = useRef(0);
  const currentRunId = useRef(runId);
  currentRunId.current = runId;
  useEffect(() => {
    setBuiltRunId(null);
    setCoverRequest(null);
    setCoverStatus({ status: "idle" });
    return () => {
      if (pendingCover.current) window.clearTimeout(pendingCover.current.timer);
      pendingCover.current = null;
      savingCover.current = false;
      saveGeneration.current += 1;
      onCancelSceneCover?.();
    };
  }, [runId, onCancelSceneCover]);
  const requestCover = (): void => {
    if (generationBlocked.current || actionPending || !runId || !onSaveSceneCover || pendingCover.current || savingCover.current) return;
    const requestId = `${runId}-cover-${++coverSequence.current}`;
    const timer = window.setTimeout(() => {
      if (pendingCover.current?.requestId !== requestId) return;
      pendingCover.current = null;
      setCoverRequest(null);
      setCoverStatus({ status: "error", message: "截图超时，请重试。" });
    }, CAPTURE_TIMEOUT_MS);
    pendingCover.current = { runId: runId, requestId, timer };
    setCoverStatus({ status: "capturing" });
    setCoverRequest(createCaptureRequest(runId, requestId, [{ azimuthDeg: 0, elevationDeg: 0 }]));
  };

  const cancel = (): void => {
    generationBlocked.current = true;
    if (pendingCover.current) window.clearTimeout(pendingCover.current.timer);
    pendingCover.current = null;
    savingCover.current = false;
    saveGeneration.current += 1;
    onCancelSceneCover?.();
    setCoverRequest(null);
    setCoverStatus({ status: "idle" });
  };
  const handleCaptured = (message: CapturesMessage): boolean => {
    const pending = pendingCover.current;
    if (pending && message.runId === pending.runId && message.requestId === pending.requestId) {
      window.clearTimeout(pending.timer);
      pendingCover.current = null;
      setCoverRequest(null);
      const capture = message.images[0];
      if (!capture || !onSaveSceneCover) {
        setCoverStatus({ status: "error", message: "截图失败，请重试。" });
        return true;
      }
      savingCover.current = true;
      const generation = ++saveGeneration.current;
      setCoverStatus({ status: "saving" });
      void onSaveSceneCover(pending.runId, capture).then(() => {
        if (generation !== saveGeneration.current) return;
        savingCover.current = false;
        if (mounted.current && currentRunId.current === pending.runId) setCoverStatus({ status: "success", message: "已设为封面。" });
      }).catch((error: unknown) => {
        if (generation !== saveGeneration.current) return;
        savingCover.current = false;
        if (mounted.current && currentRunId.current === pending.runId) setCoverStatus({ status: "error", message: `${describeGalleryError(error)}；如已上传成功，重试将沿用上次截图。` });
      });
      return true;
    }
    return message.requestId.includes("-cover-");
  };
  const handleFailure = (failure: SceneSandboxFailure): void => {
    if (!matchesCoverRequest(pendingCover.current, failure.requestId) || !pendingCover.current) return;
    window.clearTimeout(pendingCover.current.timer);
    pendingCover.current = null;
    setCoverRequest(null);
    setCoverStatus({ status: "error", message: "截图失败，请重试。" });
  };
  return { builtRunId, setBuiltRunId, coverRequest, coverStatus, requestCover, cancel, handleCaptured, handleFailure };
}
