import { useState } from "react";
import type { ReactNode } from "react";
import { Button } from "../../../../../components/ui";
import { classNames } from "../../../../../components/ui/classNames";
import type { PhotoLocationCandidate } from "../../../../../objects/curation/PhotoLocationCandidatesResponse";
import type { LocationGranularity } from "../../../../../objects/gallery/PhotoLocationView";
import {
  candidateGranularityChoices,
  candidateHasCoordinates,
  defaultConfirmGranularity,
  describeCandidateCoordinates,
  describeCandidateGranularity,
} from "../functions/describeCandidate";
import { LOCATION_GRANULARITY_OPTIONS } from "../functions/describeLocation";
import type { CandidateConfirmState, LocationCandidateState } from "../objects/MapPanelState";

export interface LocationCandidateSectionProps {
  readonly candidateState: LocationCandidateState;
  readonly ignoredCandidateIds: readonly string[];
  readonly candidateConfirmState: CandidateConfirmState;
  readonly isSaving: boolean;
  readonly onSuggestCandidates: () => void;
  readonly onRefreshCandidates: () => void;
  readonly onIgnoreCandidate: (candidateId: string) => void;
  readonly onConfirmCandidate: (
    candidate: PhotoLocationCandidate,
    granularity: LocationGranularity,
  ) => void;
}

/**
 * AI 地点候选区：只展示/确认候选，不直接写位置。
 * 候选未确认不进入地图或发布快照；确认动作由上层调用 API，成功后回到位置草稿。
 */
export function LocationCandidateSection({
  candidateState,
  ignoredCandidateIds,
  candidateConfirmState,
  isSaving,
  onSuggestCandidates,
  onRefreshCandidates,
  onIgnoreCandidate,
  onConfirmCandidate,
}: LocationCandidateSectionProps) {
  const [adoptingCandidateId, setAdoptingCandidateId] = useState<string | null>(null);
  const [adoptGranularity, setAdoptGranularity] = useState<LocationGranularity>("hidden");

  const visibleCandidates =
    candidateState.status === "ready"
      ? candidateState.candidates.filter(
          (candidate) => !ignoredCandidateIds.includes(candidate.id),
        )
      : [];

  const startAdopt = (candidate: PhotoLocationCandidate): void => {
    setAdoptingCandidateId(candidate.id);
    setAdoptGranularity(defaultConfirmGranularity(candidate));
  };

  const candidateBody = (): ReactNode => {
    switch (candidateState.status) {
      case "idle":
        return null;
      case "loading":
        return <p className="mt-3 text-caption text-muted">正在读取已存候选…</p>;
      case "generating":
        return <p className="mt-3 text-caption text-muted">AI 正在识别这张照片的地点…</p>;
      case "empty":
        return (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-caption text-muted">
              {candidateState.origin === "suggested"
                ? "AI 没有给出可靠地点。"
                : "还没有 AI 候选。点「AI 识别地点」让 AI 给出地点建议。"}
            </p>
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={
                  candidateState.origin === "suggested"
                    ? onSuggestCandidates
                    : onRefreshCandidates
                }
              >
                {candidateState.origin === "suggested" ? "重新识别" : "重新读取候选"}
              </Button>
            </div>
          </div>
        );
      case "failed":
        return (
          <div className="mt-3 flex flex-col gap-2">
            <p className="text-caption text-danger">{candidateState.message}</p>
            <div>
              <Button
                size="sm"
                variant="secondary"
                onClick={
                  candidateState.origin === "suggested"
                    ? onSuggestCandidates
                    : onRefreshCandidates
                }
              >
                {candidateState.origin === "suggested" ? "重试 AI 识别" : "重新读取候选"}
              </Button>
            </div>
          </div>
        );
      case "ready":
        return (
          <div className="mt-3 flex flex-col gap-3">
            {candidateState.model === null ? null : (
              <p className="text-micro text-muted">由 AI 根据照片推测，确认后才会进入地图。</p>
            )}
            {visibleCandidates.length === 0 ? (
              <div className="flex flex-col gap-2">
                <p className="text-caption text-muted">候选都已忽略。</p>
                <div>
                  <Button size="sm" variant="secondary" onClick={onSuggestCandidates}>
                    重新运行 AI 识别
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {visibleCandidates.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-caption font-medium text-ink">{candidate.name}</p>
                      <span className="rounded-md bg-bg px-2 py-1 text-micro text-muted">
                        {describeCandidateGranularity(candidate)}
                      </span>
                    </div>
                    <p className="text-micro text-muted">
                      {describeCandidateCoordinates(candidate)}
                    </p>
                    <p className="text-micro text-muted">理由：{candidate.reason}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={() => startAdopt(candidate)}>
                        采用为位置
                      </Button>
                      <button
                        type="button"
                        className="text-caption text-muted underline-offset-4 hover:underline"
                        onClick={() => onIgnoreCandidate(candidate.id)}
                      >
                        忽略
                      </button>
                    </div>

                    {adoptingCandidateId === candidate.id ? (
                      <div className="mt-2 flex flex-col gap-3 rounded-md border border-line bg-bg p-3">
                        <fieldset className="flex flex-col gap-2">
                          <legend className="text-caption text-muted">确认后的公开范围</legend>
                          {candidateGranularityChoices(candidate).map((choice) => {
                            const option = LOCATION_GRANULARITY_OPTIONS.find(
                              (item) => item.value === choice.value,
                            )!;
                            return (
                              <label
                                key={choice.value}
                                className={classNames(
                                  "flex items-start gap-2 text-caption",
                                  choice.disabled ? "text-muted" : "text-ink",
                                )}
                              >
                                <input
                                  type="radio"
                                  name={`candidate-granularity-${candidate.id}`}
                                  value={choice.value}
                                  checked={adoptGranularity === choice.value}
                                  disabled={choice.disabled}
                                  onChange={() => setAdoptGranularity(choice.value)}
                                  className="mt-1 accent-accent"
                                />
                                <span>
                                  {option.label}
                                  <span className="ml-1 text-micro text-muted">
                                    {option.description}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </fieldset>
                        {candidateHasCoordinates(candidate) ? null : (
                          <p className="text-micro text-muted">
                            没有坐标，只能保存为不公开的地点名称。
                          </p>
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            loading={
                              candidateConfirmState.status === "confirming" &&
                              candidateConfirmState.candidateId === candidate.id
                            }
                            onClick={() => onConfirmCandidate(candidate, adoptGranularity)}
                          >
                            确认采用
                          </Button>
                          <button
                            type="button"
                            className="text-caption text-muted underline-offset-4 hover:underline"
                            onClick={() => setAdoptingCandidateId(null)}
                          >
                            取消
                          </button>
                        </div>
                        {candidateConfirmState.status === "failed" ? (
                          <p className="text-caption text-danger">
                            {candidateConfirmState.message}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-line bg-bg p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-serif text-h2 text-ink">AI 位置候选</h3>
          <p className="mt-1 text-micro text-muted">
            只在你点击后调用 AI；候选未确认不会进入地图或发布快照，也不影响 EXIF/手动位置。
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={candidateState.status === "generating"}
          disabled={candidateState.status === "generating" || isSaving}
          onClick={onSuggestCandidates}
        >
          AI 识别地点
        </Button>
      </div>
      {candidateBody()}
    </div>
  );
}
