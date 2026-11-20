import { useEffect, useRef, useState } from "react";
import { versionedContributionImageUrl } from "../../../../../apis/gallery/contributionContent";
import type { FormEvent } from "react";
import { AuthorizedPhotoThumb } from "../../../../../components/AuthorizedPhotoThumb";
import { Button } from "../../../../../components/ui";
import type { ContributionSummary } from "../../../../../objects/gallery/Contribution";
import type { LocationGranularity } from "../../../../../objects/gallery/PhotoLocationView";
import { LOCATION_GRANULARITY_OPTIONS } from "../../MapPanel/functions/describeLocation";
import {
  defaultAdoptionGroupId,
  describeAdoptionGroup,
  validateAdoptionForm,
} from "../functions/contributionManagement";
import type { AdoptedSnapshot, AdoptionFormValues, AdoptionGroupOption } from "../functions/contributionManagement";

export interface AdoptContributionDialogProps {
  readonly contribution: ContributionSummary;
  readonly current?: AdoptedSnapshot | null;
  /** 当前草稿的章节（取自最近一次详情）；首次采用时可以选择把新照片放进哪一章。 */
  readonly groups: readonly AdoptionGroupOption[];
  readonly submitting: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly onSubmit: (values: AdoptionFormValues) => void;
}

/**
 * 采用/更新对话框（v1.12）：只剩「收进草稿」——把投稿照片与讲述收进草稿的新照片。
 * 图注预填建议图注、可修改/清空、不强制；位置与公开粒度保留；不再有目标照片选择器。
 * 待确认更新仍原地更新到最新版（目标由服务端已采用关系决定）。
 */
export function AdoptContributionDialog({
  contribution,
  current = null,
  groups,
  submitting,
  error,
  onCancel,
  onSubmit,
}: AdoptContributionDialogProps) {
  const isUpdate = contribution.adoption !== null && contribution.hasPendingUpdate;
  const dialogRef = useRef<HTMLDialogElement>(null);

  // 原生模态：Esc、焦点囚禁与遮罩由浏览器负责；关闭（卸载）时把焦点还给打开它的按钮。
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.showModal();
    return () => opener?.focus();
  }, []);
  const initialLocation = isUpdate ? current?.location ?? null : contribution.location;
  const [caption, setCaption] = useState(isUpdate ? current?.caption ?? "" : contribution.suggestedCaption ?? "");
  const [locationName, setLocationName] = useState(initialLocation?.name ?? "");
  const [latitude, setLatitude] = useState(
    initialLocation?.latitude === null || initialLocation?.latitude === undefined
      ? ""
      : String(initialLocation.latitude),
  );
  const [longitude, setLongitude] = useState(
    initialLocation?.longitude === null || initialLocation?.longitude === undefined
      ? ""
      : String(initialLocation.longitude),
  );
  const [granularity, setGranularity] = useState<LocationGranularity>(
    isUpdate && current?.location ? current.location.granularity : initialLocation?.latitude !== null && initialLocation?.latitude !== undefined
      ? "area"
      : "hidden",
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  // 只有首次采用（新建照片）才能选章节；原地更新不移动照片。
  const canPickGroup = !isUpdate && groups.length > 0;
  const [groupId, setGroupId] = useState<string | null>(() => defaultAdoptionGroupId(groups));

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (isUpdate && current === null) {
      setValidationError("无法读取当前草稿，请刷新页面后重试。");
      return;
    }
    const unchangedLocation = isUpdate && locationName === (initialLocation?.name ?? "") &&
      latitude === (initialLocation?.latitude == null ? "" : String(initialLocation.latitude)) &&
      longitude === (initialLocation?.longitude == null ? "" : String(initialLocation.longitude)) &&
      granularity === (current?.location?.granularity ?? "hidden");
    const validation = validateAdoptionForm(
      caption,
      unchangedLocation ? "" : locationName,
      unchangedLocation ? "" : latitude,
      unchangedLocation ? "" : longitude,
      granularity,
    );
    if (!validation.ok) {
      setValidationError(validation.message);
      return;
    }
    setValidationError(null);
    onSubmit({ ...validation.values, location: unchangedLocation ? null : validation.values.location, groupId: canPickGroup ? groupId : null });
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label={isUpdate ? "更新已采用的回忆" : "采用回忆"}
      onCancel={(event) => {
        // Esc：提交中不关闭，其余等同「取消」。
        event.preventDefault();
        if (!submitting) {
          onCancel();
        }
      }}
      className="m-auto w-full max-w-2xl bg-transparent p-4 text-ink backdrop:bg-night/60"
    >
      <form
        className="max-h-[90vh] w-full overflow-y-auto rounded-xl border border-line bg-bg p-6"
        onSubmit={submit}
      >
        <h2 className="font-serif text-h2 text-ink">
          {isUpdate ? "更新到最新版" : "收进草稿"}
        </h2>
        <p className="mt-1 text-caption text-muted">
          第 {contribution.version} 版 · {contribution.contributor.displayName}
          {isUpdate
            ? ` · 当前已采用第 ${contribution.adoption!.adoptedVersion} 版，会在已采用的照片上原地更新讲述与位置`
            : " · 投稿照片与讲述会收进草稿，成为一张新照片"}
        </p>

        <p className="mt-3 rounded-md bg-accentSoft px-4 py-3 text-caption text-ink">
          {isUpdate
            ? "如果讲述文字有变化，当前三维场景会变为「已过期」（讲述和照片一样会作为策展与场景的素材）：发布前需要重新生成场景，已发布的公开页不受影响。可以全部处理完再统一重新生成。"
            : "采用会给草稿新增一张照片，当前三维场景会因此变为「已过期」：发布前需要重新生成场景，已发布的公开页不受影响。一次采用多条回忆时，可以全部处理完再统一重新生成。采用后，这段讲述会和照片一起用于 AI 策展与场景生成。"}
        </p>

        <div className="mt-4 flex items-start gap-4 rounded-md border border-line bg-surface p-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-accentSoft">
            <AuthorizedPhotoThumb url={versionedContributionImageUrl(contribution.file!.thumbUrl, contribution.version)} alt="投稿照片" />
          </div>
          <blockquote className="min-w-0 flex-1 border-l-2 border-line pl-4 font-serif text-body text-ink">
            {contribution.memoryText}
          </blockquote>
        </div>
        {contribution.suggestedCaption === null ? null : (
          <p className="mt-2 text-caption text-muted">
            投稿者建议的图注：{contribution.suggestedCaption}{isUpdate ? "（当前保留草稿图注）" : "（已预填，可修改或清空）"}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-medium text-ink">图注（可清空，不强制）</span>
            <input
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
              maxLength={140}
              placeholder="收进草稿后的照片图注"
              className="rounded-md border border-line bg-surface px-3 py-2 text-caption text-ink placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <span className="text-micro text-muted">
              {isUpdate ? "默认保留当前草稿图注；清空会提交空图注。" : "预填投稿者的建议图注；清空会提交空图注。可稍后在策展中修改。"}
            </span>
          </label>

          {canPickGroup ? (
            <label className="flex flex-col gap-1">
              <span className="text-caption font-medium text-ink">放进哪个章节</span>
              <select
                aria-label="放进哪个章节"
                value={groupId ?? ""}
                onChange={(event) => setGroupId(event.target.value === "" ? null : event.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-2 text-caption text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {groups.map((group, index) => (
                  <option key={group.id} value={group.id}>
                    {describeAdoptionGroup(group, index)}
                  </option>
                ))}
                <option value="">暂不放入章节（稍后在策展里处理）</option>
              </select>
              <span className="text-micro text-muted">
                新照片会放在所选章节的末尾；不放入章节时，要先到策展里放入章节才能保存策展。
              </span>
            </label>
          ) : null}

          <div>
            <p className="text-caption text-muted">位置（可选；不公开时只保留在草稿）</p>
            {isUpdate ? <p className="text-micro text-muted">默认保留当前草稿位置；留空不会删除已有位置。投稿者建议：{contribution.location?.name ?? "无"}{contribution.location?.latitude == null ? "" : ` · ${contribution.location.latitude}, ${contribution.location.longitude}`}</p> : null}
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input
                value={locationName}
                onChange={(event) => setLocationName(event.target.value)}
                placeholder="地点名称"
                aria-label="地点名称"
                className="rounded-md border border-line bg-surface px-3 py-2 text-caption text-ink placeholder:text-muted"
              />
              <input
                value={latitude}
                onChange={(event) => setLatitude(event.target.value)}
                inputMode="decimal"
                placeholder="纬度"
                aria-label="纬度"
                className="rounded-md border border-line bg-surface px-3 py-2 text-caption text-ink placeholder:text-muted"
              />
              <input
                value={longitude}
                onChange={(event) => setLongitude(event.target.value)}
                inputMode="decimal"
                placeholder="经度"
                aria-label="经度"
                className="rounded-md border border-line bg-surface px-3 py-2 text-caption text-ink placeholder:text-muted"
              />
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-caption text-muted">公开粒度</legend>
            {LOCATION_GRANULARITY_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-start gap-2 text-caption text-ink">
                <input
                  type="radio"
                  name="adopt-granularity"
                  checked={granularity === option.value}
                  onChange={() => setGranularity(option.value)}
                />
                <span>
                  {option.label}
                  <span className="ml-1 text-micro text-muted">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        {validationError === null ? null : (
          <p className="mt-3 text-caption text-danger">{validationError}</p>
        )}
        {error === null ? null : <p className="mt-3 text-caption text-danger">{error}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            取消
          </Button>
          <Button type="submit" loading={submitting}>
            {isUpdate ? "更新到最新版" : "收进草稿"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
