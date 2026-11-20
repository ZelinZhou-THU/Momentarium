import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "../../../components/ui";
import { MapView } from "../../../maps/MapView";
import type { MapLoadState } from "../../../maps/MapView";
import { MAP_PRIVACY_NOTICE } from "../../../maps/mapNotices";
import { useOnlineStatus } from "../../../maps/useOnlineStatus";
import {
  applyMapPointToFields,
  applyPlaceCandidateToFields,
  CONTRIBUTION_MAP_PICK_HINT,
  describeContributionMapHint,
  describeMissingPlaceName,
  EMPTY_LOCATION_FIELDS,
  pickedMarkersOf,
  pointOfFields,
  PICKED_MARKER_ID,
} from "../functions/contributionPlace";
import type { ContributionMapAvailability } from "../functions/contributionPlace";
import { usePlaceSearch } from "../hooks/usePlaceSearch";
import type { ContributionLocationFields } from "../objects/ContributionLocationFields";

export interface ContributionLocationFieldProps {
  readonly value: ContributionLocationFields;
  readonly onChange: (value: ContributionLocationFields) => void;
  readonly disabled: boolean;
}

const INPUT_CLASS =
  "rounded-md border border-line bg-bg px-3 py-2 text-caption text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const RESULT_CLASS =
  "flex w-full flex-col gap-1 rounded-md border border-line bg-bg px-3 py-2 text-left transition-colors duration-150 ease-out hover:bg-accentSoft motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

/**
 * 投稿者的地点字段：先搜地名（只发送搜索词）→ 点结果填入名称与坐标；也可以开启在线地图点选，
 * 名称与坐标仍可手改。地图默认不加载（先说明外部依赖），不可用时搜索与手填照常工作。
 */
export function ContributionLocationField({ value, onChange, disabled }: ContributionLocationFieldProps) {
  const [query, setQuery] = useState("");
  const [mapEnabled, setMapEnabled] = useState(false);
  const [availability, setAvailability] = useState<ContributionMapAvailability>("closed");
  const online = useOnlineStatus();
  const search = usePlaceSearch();

  const point = pointOfFields(value);
  const markers = useMemo(
    () => pickedMarkersOf(value.name, value.latitude, value.longitude),
    [value.name, value.latitude, value.longitude],
  );

  const submitSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    search.search(query);
  };

  const toggleMap = (): void => {
    setMapEnabled((enabled) => !enabled);
    setAvailability(mapEnabled ? "closed" : "loading");
  };

  const mapHint = describeContributionMapHint(availability, online);
  const nameHint = describeMissingPlaceName(value);

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submitSearch} className="flex items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-micro text-muted">按地名搜索（只发送你输入的地名）</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="例如：济州岛 涯月"
            aria-label="搜索地点名称"
            disabled={disabled}
            className={INPUT_CLASS}
          />
        </label>
        <Button
          type="submit"
          size="sm"
          variant="secondary"
          loading={search.state.status === "searching"}
          disabled={disabled}
        >
          搜索
        </Button>
      </form>

      {search.state.status === "results" ? (
        <ul className="flex flex-col gap-2">
          {search.state.candidates.map((candidate) => (
            <li key={`${candidate.name}-${candidate.latitude}-${candidate.longitude}`}>
              <button
                type="button"
                className={RESULT_CLASS}
                disabled={disabled}
                onClick={() => {
                  onChange(applyPlaceCandidateToFields(candidate));
                  search.clear();
                }}
              >
                <span className="text-caption text-ink">{candidate.name}</span>
                <span className="text-micro text-muted">{candidate.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : search.state.status === "empty" ? (
        <p className="text-caption text-muted">没有找到匹配的地点，可以换个名称再试，或开启地图直接点选。</p>
      ) : search.state.status === "error" ? (
        <p className="text-caption text-danger">{search.state.message}</p>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <input
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          placeholder="地点名称"
          aria-label="地点名称"
          disabled={disabled}
          className={INPUT_CLASS}
        />
        <input
          value={value.latitude}
          onChange={(event) => onChange({ ...value, latitude: event.target.value })}
          inputMode="decimal"
          placeholder="纬度"
          aria-label="纬度"
          disabled={disabled}
          className={INPUT_CLASS}
        />
        <input
          value={value.longitude}
          onChange={(event) => onChange({ ...value, longitude: event.target.value })}
          inputMode="decimal"
          placeholder="经度"
          aria-label="经度"
          disabled={disabled}
          className={INPUT_CLASS}
        />
      </div>
      {nameHint === null ? null : <p className="text-caption text-accent">{nameHint}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="ghost" onClick={toggleMap} disabled={disabled}>
          {mapEnabled ? "关闭地图" : "在地图上选点"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onChange(EMPTY_LOCATION_FIELDS)}
          disabled={disabled || (value.name === "" && value.latitude === "" && value.longitude === "")}
        >
          清除地点
        </Button>
      </div>

      {mapEnabled ? (
        <MapView
          markers={markers}
          selectedMarkerId={point === null ? null : PICKED_MARKER_ID}
          onSelectMarker={() => undefined}
          onPickPoint={(picked) => onChange(applyMapPointToFields(value, picked))}
          ariaLabel="选择回忆发生的位置"
          onLoadStateChange={(state: MapLoadState) => setAvailability(state)}
        />
      ) : (
        <p className="text-micro text-muted">{MAP_PRIVACY_NOTICE}</p>
      )}
      {mapEnabled && availability === "ready" ? (
        <p className="text-micro text-muted">{CONTRIBUTION_MAP_PICK_HINT}</p>
      ) : null}
      {mapHint === null ? null : <p className="text-caption text-danger">{mapHint}</p>}
    </div>
  );
}
