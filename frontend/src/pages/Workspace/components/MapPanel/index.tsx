import type { ExhibitionDetail } from "../../../../objects/gallery/ExhibitionDetail";
import { LocationEditor } from "./components/LocationEditor";
import { LocationMapSection } from "./components/LocationMapSection";
import { LocationPhotoList } from "./components/LocationPhotoList";
import { useLocationPanel } from "./hooks/useLocationPanel";

export interface MapPanelProps {
  readonly exhibition: ExhibitionDetail;
  readonly onChanged: () => void;
}

/**
 * 工作台「地图」分区（阶段 1）：左侧照片位置列表，右侧地图与位置编辑。
 * 地图是可选步骤（不进入"下一步"强制流程）；地图未开启/不可用时，列表与编辑照常工作。
 */
export function MapPanel({ exhibition, onChanged }: MapPanelProps) {
  const panel = useLocationPanel(exhibition, onChanged);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-1">
        <LocationPhotoList
          rows={panel.rows}
          selectedPhotoId={panel.selectedRow?.photoId ?? null}
          onSelect={panel.selectPhoto}
        />
      </div>
      <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
        <LocationMapSection
          rows={panel.rows}
          selectedRow={panel.selectedRow}
          onSelectMarker={panel.selectPhoto}
          onPickPoint={panel.pickPoint}
        />
        <LocationEditor
          row={panel.selectedRow}
          draft={panel.draft}
          searchState={panel.searchState}
          saveState={panel.saveState}
          errors={panel.errors}
          isSaving={panel.isSaving}
          candidateState={panel.candidateState}
          ignoredCandidateIds={panel.ignoredCandidateIds}
          candidateConfirmState={panel.candidateConfirmState}
          onUpdateDraft={panel.updateDraft}
          onSearch={panel.searchPlaces}
          onApplyCandidate={panel.applyCandidate}
          onSave={panel.saveLocation}
          onClear={panel.clearLocation}
          onSuggestCandidates={panel.suggestCandidates}
          onRefreshCandidates={panel.refreshCandidates}
          onIgnoreCandidate={panel.ignoreCandidate}
          onConfirmCandidate={panel.confirmCandidate}
        />
      </div>
    </div>
  );
}
