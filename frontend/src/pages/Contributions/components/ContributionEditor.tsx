import { useEffect, useRef, useState } from "react";
import { versionedContributionImageUrl } from "../../../apis/gallery/contributionContent";
import { CreateContributionAPI } from "../../../apis/gallery/CreateContributionAPI";
import { UpdateContributionAPI } from "../../../apis/gallery/UpdateContributionAPI";
import { UploadContributionsAPI } from "../../../apis/gallery/UploadContributionsAPI";
import { describeContributionError } from "../../../apis/gallery/describeContributionError";
import { AuthorizedPhotoThumb } from "../../../components/AuthorizedPhotoThumb";
import { Button } from "../../../components/ui";
import { CONTRIBUTION_AI_USE_NOTICE } from "../../../objects/gallery/contributionNotices";
import {
  CONTRIBUTION_MAX_MEMORY_CODE_POINTS,
  CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS,
  describePhotoQuotaHint,
  isParticipantRevokedError,
  validateContributionEditor,
  validateContributionPhoto,
  validatePhotoForSubmit,
  validateSuggestedCaption,
} from "../functions/contributionGroups";
import { locationFieldsOf } from "../functions/contributionPlace";
import type { ContributionEditorTarget } from "../objects/ContributionsState";
import { ContributionLocationField } from "./ContributionLocationField";

type SaveState =
  | { readonly status: "idle" }
  | { readonly status: "saving"; readonly submit: boolean }
  | { readonly status: "error"; readonly message: string };

export interface ContributionEditorProps {
  readonly target: ContributionEditorTarget;
  readonly onSaved: () => void;
  readonly onCancel: () => void;
  readonly onRevoked: () => void;
  /** 回忆已保存但照片附件失败时，交给列表页显示提示（编辑器会关闭并刷新）。 */
  readonly onPhotoError: (message: string) => void;
}

const codePointLength = (value: string): number => [...value].length;

const UPLOAD_FAILURE_LABELS: Readonly<Record<string, string>> = {
  UPLOAD_TOO_LARGE: "文件过大（>15 MiB）",
  UPLOAD_UNSUPPORTED_TYPE: "格式不支持（仅 JPEG/PNG/WebP）",
};

const failureMessage = (failure: { fileName: string; reason: string }): string =>
  `${failure.fileName}：${UPLOAD_FAILURE_LABELS[failure.reason] ?? failure.reason}`;

/**
 * 回忆优先编辑器（单页）：一段回忆文字（提交时 1–1000 字）+ 可选 1 张照片 + 可选地点；
 * 「保存草稿」与「提交给策展人」两个动作。新建先 createcontribution，再按需附加/替换一张照片；
 * 修改走 updatecontribution（submit/removePhoto），照片通过投稿上传接口附加。
 */
export function ContributionEditor({
  target,
  onSaved,
  onCancel,
  onRevoked,
  onPhotoError,
}: ContributionEditorProps) {
  const existing = target.kind === "edit" ? target.contribution : null;
  const exhibitionId = target.kind === "create" ? target.exhibitionId : existing!.exhibitionId;
  const exhibitionTitle = target.kind === "create" ? target.exhibitionTitle : existing!.exhibitionTitle;

  const [memoryText, setMemoryText] = useState(existing?.memoryText ?? "");
  const [suggestedCaption, setSuggestedCaption] = useState(existing?.suggestedCaption ?? "");
  const [locationFields, setLocationFields] = useState(() =>
    locationFieldsOf(existing?.location ?? null),
  );
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (photoFile === null) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  const hasExistingPhoto = existing?.file !== null && existing?.file !== undefined;
  const showExistingPhoto = hasExistingPhoto && !removePhoto && photoFile === null;

  const selectPhoto = (files: FileList | null): void => {
    if (files === null || files.length === 0) {
      return;
    }
    const file = files[0]!;
    const validation = validateContributionPhoto(file);
    if (!validation.ok) {
      setSaveState({ status: "error", message: validation.message });
      return;
    }
    setPhotoFile(file);
    setRemovePhoto(false);
    setSaveState({ status: "idle" });
  };

  const finishAttachment = (contributionId: string, onUploaded: () => void): void => {
    if (photoFile === null) {
      onUploaded();
      return;
    }
    new UploadContributionsAPI(exhibitionId, [photoFile], contributionId).send().then(
      (response) => {
        if (response.failures.length > 0) {
          onPhotoError(
            `回忆已保存，但照片没有附上：${response.failures.map(failureMessage).join("；")}`,
          );
          onSaved();
          return;
        }
        onUploaded();
      },
      (error: unknown) => {
        onPhotoError(`回忆已保存，但照片没有附上：${describeContributionError(error)}`);
        onSaved();
      },
    );
  };

  const save = (submit: boolean): void => {
    const validated = validateContributionEditor(
      memoryText,
      submit,
      locationFields.name,
      locationFields.latitude,
      locationFields.longitude,
    );
    if (!validated.ok) {
      setSaveState({ status: "error", message: validated.message });
      return;
    }
    const validatedCaption = validateSuggestedCaption(suggestedCaption);
    if (!validatedCaption.ok) {
      setSaveState({ status: "error", message: validatedCaption.message });
      return;
    }
    if (submit) {
      const photoValidation = validatePhotoForSubmit(
        hasExistingPhoto,
        photoFile !== null,
        removePhoto,
      );
      if (!photoValidation.ok) {
        setSaveState({ status: "error", message: photoValidation.message });
        return;
      }
    }
    setSaveState({ status: "saving", submit });

    const captionValue = validatedCaption.value;
    const onMutationError = (error: unknown): void => {
      if (isParticipantRevokedError(error)) {
        onRevoked();
      }
      setSaveState({ status: "error", message: describeContributionError(error) });
    };

    /** 照片已附上后再提交（v1.12：创建/改图先存草稿，再 update submit=true）。 */
    const submitAfterPhoto = (contributionId: string): void => {
      new UpdateContributionAPI(
        contributionId,
        validated.memoryText,
        validated.location,
        false,
        true,
        captionValue,
      )
        .send()
        .then(() => onSaved(), onMutationError);
    };

    if (existing === null) {
      // v1.12 创建只建 draft（不再带 submit），附图后再用 update 提交。
      new CreateContributionAPI(exhibitionId, validated.memoryText, captionValue, validated.location)
        .send()
        .then((created) => {
          finishAttachment(created.id, () => {
            if (submit) {
              submitAfterPhoto(created.id);
              return;
            }
            onSaved();
          });
        }, onMutationError);
      return;
    }

    if (photoFile !== null) {
      // 有新增/替换照片：先保存内容（不提交），附图后再按需提交，避免提交时无图。
      new UpdateContributionAPI(
        existing.id,
        validated.memoryText,
        validated.location,
        removePhoto,
        false,
        captionValue,
      )
        .send()
        .then((updated) => {
          finishAttachment(updated.id, () => {
            if (submit) {
              submitAfterPhoto(updated.id);
              return;
            }
            onSaved();
          });
        }, onMutationError);
      return;
    }

    new UpdateContributionAPI(
      existing.id,
      validated.memoryText,
      validated.location,
      removePhoto,
      submit,
      captionValue,
    )
      .send()
      .then(() => onSaved(), onMutationError);
  };

  const isSaving = saveState.status === "saving";
  const isEditing = existing !== null;
  const editorTitle = isEditing ? "修改这段回忆" : "写一段回忆";
  const memoryCount = codePointLength(memoryText);

  return (
    <section className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="font-serif text-h2 text-ink">{editorTitle}</h2>
          <p className="mt-1 text-caption text-muted">《{exhibitionTitle}》 · 写下一段回忆，并附一张照片；保存草稿可暂不附图。</p>
        </div>
        <button
          type="button"
          className="text-caption text-muted underline-offset-4 hover:underline"
          onClick={onCancel}
          disabled={isSaving}
        >
          取消
        </button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-medium text-ink">回忆</span>
        <textarea
          value={memoryText}
          onChange={(event) => setMemoryText(event.target.value)}
          rows={6}
          placeholder="写下这张照片或这个时刻背后的回忆与讲述。"
          className="w-full rounded-md border border-line bg-bg px-3 py-2 text-body text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <span className="text-right text-micro text-muted">
          {memoryCount}/{CONTRIBUTION_MAX_MEMORY_CODE_POINTS} · 保存草稿可以为空，提交时需要 1 个字以上
        </span>
        <span className="text-micro text-muted">{CONTRIBUTION_AI_USE_NOTICE}</span>
      </label>

      <div className="flex flex-col gap-1">
        <label className="flex flex-col gap-1">
          <span className="text-caption font-medium text-ink">建议图注（可选）</span>
          <input
            value={suggestedCaption}
            onChange={(event) => setSuggestedCaption(event.target.value)}
            maxLength={CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS + 20}
            placeholder="展览照片下方的一句短说明，策展人可采用或修改。"
            className="w-full rounded-md border border-line bg-bg px-3 py-2 text-caption text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <span className="text-right text-micro text-muted">
            {codePointLength(suggestedCaption)}/{CONTRIBUTION_MAX_SUGGESTED_CAPTION_CODE_POINTS}
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-caption font-medium text-ink">照片（必填，最多 1 张）</span>
          <span className="text-micro text-muted">提交前必须有一张 · 保存草稿可暂缺 · 计入照片配额</span>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          {previewUrl === null ? null : (
            <img
              src={previewUrl}
              alt="待上传照片预览"
              className="h-24 w-24 rounded-md border border-line object-cover"
            />
          )}
          {showExistingPhoto && existing?.file !== null && existing?.file !== undefined ? (
            <div className="h-24 w-24 overflow-hidden rounded-md border border-line bg-accentSoft">
              <AuthorizedPhotoThumb url={versionedContributionImageUrl(existing.file.thumbUrl, existing.version)} alt="这条回忆当前的照片" />
            </div>
          ) : null}
          {previewUrl === null && !showExistingPhoto ? (
            <div className="flex h-24 w-24 items-center justify-center rounded-md border border-dashed border-line bg-bg text-center text-micro text-muted">
              暂未附图（提交前需要照片）
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                selectPhoto(event.target.files);
                event.target.value = "";
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isSaving}
            >
              {previewUrl === null && !showExistingPhoto ? "选择一张照片" : "替换照片"}
            </Button>
            {previewUrl !== null ? (
              <button
                type="button"
                className="text-left text-caption text-muted underline-offset-4 hover:underline"
                onClick={() => setPhotoFile(null)}
                disabled={isSaving}
              >
                移除新选择的照片
              </button>
            ) : null}
            {showExistingPhoto && existing?.status === "draft" ? (
              <button
                type="button"
                className="text-left text-caption text-muted underline-offset-4 hover:underline"
                onClick={() => setRemovePhoto(true)}
                disabled={isSaving}
              >
                移除这张照片
              </button>
            ) : null}
            {hasExistingPhoto && existing?.status !== "draft" ? (
              <span className="text-micro text-muted">
                已提交/待审的回忆不能移除照片，只能替换；提交前必须有一张照片。
              </span>
            ) : null}
            {removePhoto && hasExistingPhoto ? (
              <span className="text-micro text-muted">
                保存时会移除当前照片；提交前必须补一张照片，保存草稿可暂缺。
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-micro text-muted">{describePhotoQuotaHint()}</p>
        {existing !== null && existing.file === null ? (
          <p className="rounded-md border border-line bg-bg px-3 py-2 text-micro text-muted">
            历史纯文字回忆：补一张照片后才能重新提交；保存草稿仍可暂缺。
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-caption font-medium text-ink">地点（可选）</span>
        <ContributionLocationField
          value={locationFields}
          onChange={setLocationFields}
          disabled={isSaving}
        />
        <p className="text-micro text-muted">
          地点交给策展人确认是否公开、公开到什么粒度；不填也可以只提交回忆。
        </p>
      </div>

      {saveState.status === "error" ? (
        <p className="rounded-md border border-line bg-bg px-4 py-3 text-caption text-danger">
          {saveState.message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          loading={isSaving && saveState.status === "saving" && !saveState.submit}
          disabled={isSaving}
          onClick={() => save(false)}
        >
          {isEditing && existing?.status !== "draft" && existing?.status !== "declined"
            ? "保存修改"
            : "保存草稿"}
        </Button>
        <Button
          type="button"
          loading={isSaving && saveState.status === "saving" && saveState.submit}
          disabled={isSaving}
          onClick={() => save(true)}
        >
          {existing?.status === "declined" ? "重新提交" : "提交给策展人"}
        </Button>
      </div>
    </section>
  );
}
