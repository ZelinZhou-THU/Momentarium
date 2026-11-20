import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Input } from "../../../../../components/ui";
import { classNames } from "../../../../../components/ui/classNames";
import type { PlaceCandidate } from "../../../../../objects/gallery/PlaceSearchResponse";
import type { PhotoLocationCandidate } from "../../../../../objects/curation/PhotoLocationCandidatesResponse";
import type { LocationGranularity } from "../../../../../objects/gallery/PhotoLocationView";
import type { LocationRow } from "../functions/buildLocationRows";
import {
  describeLocationSource,
  describeLocationStatus,
  LOCATION_GRANULARITY_OPTIONS,
} from "../functions/describeLocation";
import type {
  CandidateConfirmState,
  LocationCandidateState,
  LocationDraft,
  LocationDraftErrors,
  LocationSaveState,
  LocationSearchState,
} from "../objects/MapPanelState";
import { LocationCandidateSection } from "./LocationCandidateSection";

export interface LocationEditorProps {
  readonly row: LocationRow | null;
  readonly draft: LocationDraft | null;
  readonly searchState: LocationSearchState;
  readonly saveState: LocationSaveState;
  readonly errors: LocationDraftErrors | null;
  readonly isSaving: boolean;
  readonly candidateState: LocationCandidateState;
  readonly ignoredCandidateIds: readonly string[];
  readonly candidateConfirmState: CandidateConfirmState;
  readonly onUpdateDraft: (patch: Partial<Omit<LocationDraft, "photoId">>) => void;
  readonly onSearch: (query: string) => void;
  readonly onApplyCandidate: (candidate: PlaceCandidate) => void;
  readonly onSave: () => void;
  readonly onClear: () => void;
  readonly onSuggestCandidates: () => void;
  readonly onRefreshCandidates: () => void;
  readonly onIgnoreCandidate: (candidateId: string) => void;
  readonly onConfirmCandidate: (
    candidate: PhotoLocationCandidate,
    granularity: LocationGranularity,
  ) => void;
}

const SEARCH_RESULT_CLASS =
  "flex w-full flex-col gap-1 rounded-md border border-line bg-bg px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-accentSoft motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface";

/**
 * 位置编辑区：搜索地点 → 填名称/坐标 → 选公开粒度 → 保存（写入即确认）或清除。
 * 校验错误就近显示；保存失败保留草稿；公开粒度文案说明公开页会看到什么。
 */
export function LocationEditor({
  row,
  draft,
  searchState,
  saveState,
  errors,
  isSaving,
  candidateState,
  ignoredCandidateIds,
  candidateConfirmState,
  onUpdateDraft,
  onSearch,
  onApplyCandidate,
  onSave,
  onClear,
  onSuggestCandidates,
  onRefreshCandidates,
  onIgnoreCandidate,
  onConfirmCandidate,
}: LocationEditorProps) {
  const [query, setQuery] = useState("");

  const submitSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSearch(query);
  };

  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-h2 text-ink">位置与公开范围</h2>
        {row === null ? null : (
          <p className="text-micro text-muted">{describeLocationStatus(row.location)}</p>
        )}
      </div>

      {draft === null ? (
        <p className="mt-3 text-caption text-muted">先在上方的照片列表里选择一张照片。</p>
      ) : (
        <>
          <LocationCandidateSection
            candidateState={candidateState}
            ignoredCandidateIds={ignoredCandidateIds}
            candidateConfirmState={candidateConfirmState}
            isSaving={isSaving}
            onSuggestCandidates={onSuggestCandidates}
            onRefreshCandidates={onRefreshCandidates}
            onIgnoreCandidate={onIgnoreCandidate}
            onConfirmCandidate={onConfirmCandidate}
          />

          <form onSubmit={submitSearch} className="mt-4 flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                label="按地点名称搜索"
                aria-label="搜索地点名称"
                placeholder="例如：济州岛 涉地可支"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                hint="搜索只发送你输入的地点名称；照片、坐标与令牌不会发给地图服务。"
              />
            </div>
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              loading={searchState.status === "searching"}
            >
              搜索
            </Button>
          </form>

          {searchState.status === "results" ? (
            <ul className="mt-3 flex flex-col gap-2">
              {searchState.candidates.map((candidate) => (
                <li key={`${candidate.name}-${candidate.latitude}-${candidate.longitude}`}>
                  <button
                    type="button"
                    className={SEARCH_RESULT_CLASS}
                    onClick={() => onApplyCandidate(candidate)}
                  >
                    <span className="text-caption text-ink">{candidate.name}</span>
                    <span className="text-micro text-muted">{candidate.displayName}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : searchState.status === "empty" ? (
            <p className="mt-3 text-caption text-muted">没有找到匹配的地点，可以换个名称再试或直接在地图上选点。</p>
          ) : searchState.status === "error" ? (
            <p className="mt-3 text-caption text-danger">{searchState.message}</p>
          ) : null}

          <form
            className="mt-6 flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSave();
            }}
          >
            <Input
              label="地点名称"
              value={draft.name}
              onChange={(event) => onUpdateDraft({ name: event.target.value })}
              error={errors?.name ?? undefined}
              hint={
                row?.location === null || row?.location === undefined
                  ? "仅用于位置说明；不公开时公开页不会显示。"
                  : `来源：${describeLocationSource(row.location.source)}`
              }
            />

            <fieldset className="flex flex-col gap-2">
              <legend className="text-caption text-muted">公开范围</legend>
              {LOCATION_GRANULARITY_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={classNames(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2",
                    draft.granularity === option.value
                      ? "border-accent bg-accentSoft"
                      : "border-line bg-bg",
                  )}
                >
                  <input
                    type="radio"
                    name="location-granularity"
                    value={option.value}
                    checked={draft.granularity === option.value}
                    onChange={() => onUpdateDraft({ granularity: option.value })}
                    className="mt-1 accent-accent"
                  />
                  <span>
                    <span className="block text-caption text-ink">{option.label}</span>
                    <span className="block text-micro text-muted">{option.description}</span>
                  </span>
                </label>
              ))}
              {errors?.granularity === null || errors?.granularity === undefined ? null : (
                <p className="text-caption text-danger">{errors.granularity}</p>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="纬度（WGS84）"
                inputMode="decimal"
                value={draft.latitude}
                onChange={(event) => onUpdateDraft({ latitude: event.target.value })}
                error={errors?.coordinates ?? undefined}
                placeholder="33.4589"
              />
              <Input
                label="经度（WGS84）"
                inputMode="decimal"
                value={draft.longitude}
                onChange={(event) => onUpdateDraft({ longitude: event.target.value })}
                placeholder="126.9365"
              />
            </div>
            <p className="text-micro text-muted">
              可以只填地名（选择「不公开」）；「公开范围」与「公开精确点」必须有坐标。也可以在地图上点击落点。
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={isSaving} disabled={isSaving}>
                保存位置
              </Button>
              <Button
                variant="secondary"
                onClick={onClear}
                disabled={isSaving || row?.location === null || row?.location === undefined}
              >
                清除位置
              </Button>
              <Button
                variant="ghost"
                onClick={() => onUpdateDraft({ latitude: "", longitude: "" })}
                disabled={isSaving}
              >
                清空坐标
              </Button>
            </div>
            <p className="text-micro text-muted">
              保存即作者确认；来源由服务端判定（确认既有 EXIF 建议会保留来源）。
            </p>
            {saveState.status === "failed" ? (
              <p className="text-caption text-danger">{saveState.message}</p>
            ) : null}
          </form>
        </>
      )}
    </section>
  );
}
