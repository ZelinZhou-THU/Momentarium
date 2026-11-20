import { Button } from "../../../../components/ui";
import type { CurationDraftGroup } from "../../objects/CurationDraft";

export interface CurationChapterNavProps {
  readonly groups: readonly CurationDraftGroup[];
  readonly unassignedCount: number;
  readonly allExpanded: boolean;
  readonly onJumpToGroup: (groupIndex: number) => void;
  readonly onJumpToUnassigned: () => void;
  readonly onToggleAll: () => void;
}

/** 章节目录：每章标题与照片数，点击跳到对应章节；空章节与未分组照片用强调色标出。 */
export function CurationChapterNav({
  groups,
  unassignedCount,
  allExpanded,
  onJumpToGroup,
  onJumpToUnassigned,
  onToggleAll,
}: CurationChapterNavProps) {
  return (
    <nav aria-label="章节目录" className="mt-8 rounded-xl border border-line bg-bg px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-micro text-muted">章节目录 · {groups.length} 章</p>
        <Button variant="ghost" size="sm" onClick={onToggleAll}>
          {allExpanded ? "全部收起" : "全部展开"}
        </Button>
      </div>
      <ol className="mt-2 flex flex-wrap gap-2">
        {groups.map((group, groupIndex) => {
          const isEmpty = group.photos.length === 0;
          return (
            <li key={`chapter-${groupIndex}`}>
              <button
                type="button"
                onClick={() => onJumpToGroup(groupIndex)}
                className={`rounded-md border px-3 py-1 text-caption transition-colors duration-150 ease-out hover:bg-accentSoft motion-reduce:transition-none ${
                  isEmpty ? "border-accent text-accent" : "border-line bg-surface text-ink"
                }`}
              >
                {groupIndex + 1} · {group.title.trim().length > 0 ? group.title : "未命名章节"}
                <span className="ml-2 text-muted">{isEmpty ? "空章节" : `${group.photos.length} 张`}</span>
              </button>
            </li>
          );
        })}
        {unassignedCount > 0 ? (
          <li>
            <button
              type="button"
              onClick={onJumpToUnassigned}
              className="rounded-md border border-accent px-3 py-1 text-caption text-accent transition-colors duration-150 ease-out hover:bg-accentSoft motion-reduce:transition-none"
            >
              未分组 {unassignedCount} 张
            </button>
          </li>
        ) : null}
      </ol>
    </nav>
  );
}
