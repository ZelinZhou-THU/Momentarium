import { useEffect, useState } from "react";
import { Button, Input, Textarea } from "../../../../components/ui";
import type { ExhibitionDetail } from "../../../../objects/gallery/ExhibitionDetail";
import {
  allGroupsExpanded,
  expandGroup,
  initialExpandedGroups,
  moveExpandedGroup,
  removeExpandedGroup,
  toggleExpandedGroup,
} from "../../functions/expandedGroups";
import type { ExpandedGroups } from "../../functions/expandedGroups";
import { unassignedPhotos } from "../../functions/unassignedPhotos";
import { useCaptionSuggestions } from "../../hooks/useCaptionSuggestions";
import type { CurationDraftModel } from "../../hooks/useCurationDraft";
import { CurationChapterNav } from "./CurationChapterNav";
import { CurationSaveBar } from "./CurationSaveBar";
import { GroupCard, curationGroupAnchorId } from "./GroupCard";
import { UNASSIGNED_TRAY_ANCHOR_ID, UnassignedTray } from "./UnassignedTray";

export interface CurationPanelProps {
  readonly curation: CurationDraftModel;
  readonly exhibition: ExhibitionDetail;
  /** 刚应用了 AI 提案时的提示（有未保存修改才显示）；null 不显示。 */
  readonly aiNotice: string | null;
  readonly onDismissAiNotice: () => void;
}

const scrollToAnchor = (anchorId: string): void => {
  // 等展开后的内容进入布局再滚动。
  window.requestAnimationFrame(() =>
    document.getElementById(anchorId)?.scrollIntoView({ behavior: "smooth", block: "start" }),
  );
};

/**
 * CurationPanel：展览标题/叙事 + 章节目录 + 章节编辑（可收起、可调整章节顺序）+ 未分组托盘
 * + 底部吸附的保存栏（滚到哪里都能保存或撤销）；应用 AI 提案后在顶部提示来源与下一步。
 */
export function CurationPanel({ curation, exhibition, aiNotice, onDismissAiNotice }: CurationPanelProps) {
  // 记忆档案里已有的 AI 建议图注（只读缓存）；只对还没有图注的照片提供「采用」。
  const captionSuggestions = useCaptionSuggestions(exhibition.id, exhibition.updatedAt);
  const unassigned = unassignedPhotos(exhibition, curation.draft);
  const isSaving = curation.saveState.status === "saving";
  const groupCount = curation.draft.groups.length;
  const [expanded, setExpanded] = useState<ExpandedGroups>(() => initialExpandedGroups(groupCount));
  const isAllExpanded = groupCount > 0 && expanded.size >= groupCount;
  const hasGroups = groupCount > 0;

  // 从无章节到有章节（如应用 AI 主题提案）时按默认规则展开，避免全部收起。
  useEffect(() => {
    if (hasGroups) {
      setExpanded((current) => (current.size === 0 ? initialExpandedGroups(groupCount) : current));
    }
  }, [hasGroups]);

  const jumpToGroup = (groupIndex: number): void => {
    setExpanded((current) => expandGroup(current, groupIndex));
    scrollToAnchor(curationGroupAnchorId(groupIndex));
  };

  return (
    <section
      aria-labelledby="curation-panel-title"
      className="rounded-xl border border-line bg-surface p-6 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="curation-panel-title" className="font-serif text-h2 text-ink">
            策展
          </h2>
          <p className="mt-2 text-caption text-muted">
            编辑标题、叙事与章节；所有照片都放进章节后才能保存。照片大图与图注可在上方「照片」区域查看，点击缩略图也可放大。每张照片的图注会显示在发布页照片下方，修改后需保存并重新发布才会公开。
          </p>
        </div>
      </header>

      {aiNotice !== null && curation.isDirty ? (
        <div
          role="status"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-accentSoft px-5 py-3"
        >
          <p className="text-caption text-ink">{aiNotice}</p>
          <Button variant="ghost" size="sm" onClick={onDismissAiNotice}>
            知道了
          </Button>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-4">
        <Input
          label="展览标题"
          value={curation.draft.title}
          onChange={(event) => curation.updateTitle(event.target.value)}
          disabled={isSaving}
        />
        <Textarea
          label="整体叙事"
          rows={3}
          hint="发布页会展示这段叙事，建议 1–3 句。"
          value={curation.draft.narrative}
          onChange={(event) => curation.updateNarrative(event.target.value)}
          disabled={isSaving}
        />
      </div>

      {groupCount > 0 ? (
        <CurationChapterNav
          groups={curation.draft.groups}
          unassignedCount={unassigned.length}
          allExpanded={isAllExpanded}
          onJumpToGroup={jumpToGroup}
          onJumpToUnassigned={() => scrollToAnchor(UNASSIGNED_TRAY_ANCHOR_ID)}
          onToggleAll={() =>
            setExpanded(isAllExpanded ? new Set<number>() : allGroupsExpanded(groupCount))
          }
        />
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        {groupCount === 0 ? (
          <p className="text-body text-muted">
            还没有章节。新建章节，或展开右下角的「AI 灵感」让 AI 给出几个章节方向。
          </p>
        ) : (
          curation.draft.groups.map((group, groupIndex) => (
            <GroupCard
              key={`group-${groupIndex}`}
              group={group}
              groupIndex={groupIndex}
              unassignedPhotos={unassigned}
              captionSuggestions={captionSuggestions}
              onTitleChange={(title) => curation.updateGroupTitle(groupIndex, title)}
              onNarrativeChange={(narrative) =>
                curation.updateGroupNarrative(groupIndex, narrative)
              }
              onPhotoCaptionChange={(photoIndex, caption) =>
                curation.updatePhotoCaption(groupIndex, photoIndex, caption)
              }
              onMovePhoto={(photoIndex, direction) =>
                curation.movePhoto(groupIndex, photoIndex, direction)
              }
              onRemovePhoto={(photoIndex) =>
                curation.removePhotoFromGroup(groupIndex, photoIndex)
              }
              onAddPhotos={(photos) => curation.addPhotosToGroup(groupIndex, photos)}
              onRemoveGroup={() => {
                setExpanded((current) => removeExpandedGroup(current, groupIndex));
                curation.removeGroup(groupIndex);
              }}
              isExpanded={expanded.has(groupIndex)}
              onToggleExpanded={() => setExpanded((current) => toggleExpandedGroup(current, groupIndex))}
              canMoveUp={groupIndex > 0}
              canMoveDown={groupIndex < groupCount - 1}
              onMoveGroup={(direction) => {
                setExpanded((current) => moveExpandedGroup(current, groupIndex, direction, groupCount));
                curation.moveGroup(groupIndex, direction);
              }}
            />
          ))
        )}
        <div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setExpanded((current) => expandGroup(current, groupCount));
              curation.addGroup();
            }}
          >
            新建章节
          </Button>
        </div>
      </div>

      <UnassignedTray
        photos={unassigned}
        groups={curation.draft.groups}
        onAssign={(photo, groupIndex) => curation.addPhotosToGroup(groupIndex, [photo])}
      />

      <CurationSaveBar
        isDirty={curation.isDirty}
        saveState={curation.saveState}
        onSave={curation.save}
        onDiscard={curation.discard}
      />
    </section>
  );
}
