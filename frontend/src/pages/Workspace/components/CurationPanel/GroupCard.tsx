import { useState } from "react";
import { useAuthorizedImage } from "../../../../apis/shared/useAuthorizedImage";
import { Button, Dialog, Input, PhotoCard, PhotoGrid, Textarea } from "../../../../components/ui";
import type { PhotoView } from "../../../../objects/gallery/PhotoView";
import type { CurationDraftGroup } from "../../objects/CurationDraft";
import { AuthorizedPhotoThumb } from "../../../../components/AuthorizedPhotoThumb";
import { ZoomablePhotoThumb } from "../../../../components/ZoomablePhotoThumb";
import { captionSuggestionFor } from "../../functions/buildCaptionSuggestions";
import type { CaptionSuggestions } from "../../functions/buildCaptionSuggestions";

export interface GroupCardProps {
  readonly group: CurationDraftGroup;
  readonly groupIndex: number;
  readonly unassignedPhotos: readonly PhotoView[];
  /** 记忆档案里的 AI 建议图注（照片 id → 建议）；只对还没有图注的照片显示「采用」。 */
  readonly captionSuggestions: CaptionSuggestions;
  readonly onTitleChange: (title: string) => void;
  readonly onNarrativeChange: (narrative: string) => void;
  readonly onPhotoCaptionChange: (photoIndex: number, caption: string) => void;
  readonly onMovePhoto: (photoIndex: number, direction: "up" | "down") => void;
  readonly onRemovePhoto: (photoIndex: number) => void;
  readonly onAddPhotos: (photos: readonly PhotoView[]) => void;
  readonly onRemoveGroup: () => void;
  readonly isExpanded: boolean;
  readonly onToggleExpanded: () => void;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
  readonly onMoveGroup: (direction: "up" | "down") => void;
}

const COLLAPSED_THUMB_LIMIT = 6;

/** 作者态照片内容路由（契约 §照片内容）：缩略图 / 大图。 */
const photoContentUrl = (photoId: string, variant: "thumb" | "full"): string =>
  `/api/photos/${photoId}/content?variant=${variant}`;

/** 章节锚点 id：章节目录跳转用。 */
export const curationGroupAnchorId = (groupIndex: number): string => `curation-group-${groupIndex}`;

/** 「采用 AI 建议」：只在有建议时出现（建议只会给没有图注的照片）。 */
function CaptionSuggestionAction({
  suggestion,
  onApply,
}: {
  readonly suggestion: string | null;
  readonly onApply: (suggestion: string) => void;
}) {
  return suggestion === null ? null : (
    <Button variant="ghost" size="sm" className="mt-1" onClick={() => onApply(suggestion)}>
      采用 AI 建议：{suggestion}
    </Button>
  );
}

interface CandidatePhotoProps {
  readonly photo: PhotoView;
  readonly onPick: () => void;
}

function CandidatePhoto({ photo, onPick }: CandidatePhotoProps) {
  const [isPicked, setIsPicked] = useState(false);
  const image = useAuthorizedImage(photo.thumbUrl);
  return (
    <div className="flex flex-col gap-2">
      {image.objectUrl === null ? (
        <div aria-hidden="true" className="aspect-square w-full rounded-xl border border-line bg-accentSoft" />
      ) : (
        <PhotoCard src={image.objectUrl} alt={photo.originalName} onSelect={onPick} />
      )}
      <span className="text-micro text-muted">{isPicked ? "已加入" : photo.originalName}</span>
      <Button variant="ghost" size="sm" onClick={() => { setIsPicked(true); onPick(); }}>
        加入本章节
      </Button>
    </div>
  );
}

/**
 * 单个章节：标题/叙事、照片顺序与图注、从“未分组”添加照片、章节上移/下移、删除章节。
 * 收起时只显示标题、照片数与缩略图条，缩短长表单。
 */
export function GroupCard({
  group,
  groupIndex,
  unassignedPhotos,
  captionSuggestions,
  onTitleChange,
  onNarrativeChange,
  onPhotoCaptionChange,
  onMovePhoto,
  onRemovePhoto,
  onAddPhotos,
  onRemoveGroup,
  isExpanded,
  onToggleExpanded,
  canMoveUp,
  canMoveDown,
  onMoveGroup,
}: GroupCardProps) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const bodyId = `${curationGroupAnchorId(groupIndex)}-body`;

  return (
    <article id={curationGroupAnchorId(groupIndex)} className="scroll-mt-24 rounded-xl border border-line p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={bodyId}
          onClick={onToggleExpanded}
          className="flex min-w-0 items-baseline gap-2 text-left"
        >
          <span className="text-caption text-muted">{isExpanded ? "▾" : "▸"} 章节 {groupIndex + 1}</span>
          {isExpanded ? null : (
            <span className="truncate text-body text-ink">
              {group.title.trim().length > 0 ? group.title : "未命名章节"}
            </span>
          )}
          {isExpanded ? null : (
            <span className={group.photos.length === 0 ? "text-caption text-accent" : "text-caption text-muted"}>
              {group.photos.length === 0 ? "空章节" : `${group.photos.length} 张`}
            </span>
          )}
        </button>
        <div className="flex flex-wrap gap-1">
          <Button variant="ghost" size="sm" disabled={!canMoveUp} onClick={() => onMoveGroup("up")}>
            章节上移
          </Button>
          <Button variant="ghost" size="sm" disabled={!canMoveDown} onClick={() => onMoveGroup("down")}>
            章节下移
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemoveGroup}>
            删除章节
          </Button>
        </div>
      </header>

      {isExpanded ? null : (
        <div className="mt-3 flex gap-2" aria-hidden="true">
          {group.photos.slice(0, COLLAPSED_THUMB_LIMIT).map((photo, photoIndex) => (
            <div
              key={`${photo.photoId}-${photoIndex}`}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-line bg-accentSoft"
            >
              <AuthorizedPhotoThumb
                url={photoContentUrl(photo.photoId, "thumb")}
                alt={`照片 ${photoIndex + 1}`}
              />
            </div>
          ))}
          {group.photos.length > COLLAPSED_THUMB_LIMIT ? (
            <span className="self-center text-caption text-muted">
              +{group.photos.length - COLLAPSED_THUMB_LIMIT}
            </span>
          ) : null}
        </div>
      )}

      <div id={bodyId} hidden={!isExpanded}>
        {isExpanded ? <>
        <div className="mt-3 flex flex-col gap-3">
          <Input label="章节标题" value={group.title} onChange={(event) => onTitleChange(event.target.value)} />
          <Textarea
            label="章节叙事"
            rows={2}
            value={group.narrative}
            onChange={(event) => onNarrativeChange(event.target.value)}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {group.photos.length === 0 ? (
            <p className="text-caption text-muted">还没有照片；从「未分组照片」里添加，否则保存时会提示空章节。</p>
          ) : (
            group.photos.map((photo, photoIndex) => (
              <div key={`${photo.photoId}-${photoIndex}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <ZoomablePhotoThumb
                  thumbUrl={photoContentUrl(photo.photoId, "thumb")}
                  fullUrl={photoContentUrl(photo.photoId, "full")}
                  alt={`章节 ${groupIndex + 1} 的第 ${photoIndex + 1} 张照片`}
                  sizeClassName="h-24 w-24"
                  caption={photo.caption}
                />
                <div className="flex-1">
                  <Input
                    label="图注"
                    value={photo.caption}
                    onChange={(event) => onPhotoCaptionChange(photoIndex, event.target.value)}
                  />
                  <CaptionSuggestionAction
                    suggestion={captionSuggestionFor(captionSuggestions, photo.photoId, photo.caption)}
                    onApply={(suggestion) => onPhotoCaptionChange(photoIndex, suggestion)}
                  />
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={photoIndex === 0}
                    onClick={() => onMovePhoto(photoIndex, "up")}
                  >
                    上移
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={photoIndex === group.photos.length - 1}
                    onClick={() => onMovePhoto(photoIndex, "down")}
                  >
                    下移
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onRemovePhoto(photoIndex)}>
                    移出
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={unassignedPhotos.length === 0}
            onClick={() => setIsAddOpen(true)}
          >
            添加照片
          </Button>
          {unassignedPhotos.length === 0 ? (
            <span className="ml-3 text-caption text-muted">没有未分组照片了</span>
          ) : null}
        </div>
        </> : null}
      </div>

      <Dialog
        open={isAddOpen}
        title={`把照片加入「${group.title}」`}
        onClose={() => setIsAddOpen(false)}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(false)}>
            完成
          </Button>
        }
      >
        {isAddOpen ? <PhotoGrid columns={4}>
          {unassignedPhotos.map((photo) => (
            <CandidatePhoto
              key={photo.id}
              photo={photo}
              onPick={() => onAddPhotos([photo])}
            />
          ))}
        </PhotoGrid> : null}
      </Dialog>
    </article>
  );
}
