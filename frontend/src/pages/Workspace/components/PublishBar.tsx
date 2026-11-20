import { useState } from "react";
import { PublishAPI } from "../../../apis/gallery/PublishAPI";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";
import { Button } from "../../../components/ui";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import { buildPublishChecks } from "../functions/buildPublishChecks";
import { formatUpdatedAt } from "../functions/formatUpdatedAt";

export interface PublishBarProps {
  readonly detail: ExhibitionDetail;
  /** 发布成功（或需要对齐服务端状态）后刷新详情：publication / hasUnpublishedChanges / sceneStale 等。 */
  readonly onChanged: () => void;
}

type PublishSubmitState =
  | { readonly status: "idle" }
  | { readonly status: "submitting" }
  | { readonly status: "succeeded"; readonly version: number; readonly publishedAt: string }
  | { readonly status: "failed"; readonly message: string };

type CopyState = "idle" | "copied" | "failed";

/**
 * PublishBar（spec §11.2）：首次发布 / 更新发布，成功后展示版本与公开链接；
 * 发布前阻断原因由 buildPublishChecks 从 detail 推断，publish 失败按 reason 显示。
 */
export function PublishBar({ detail, onChanged }: PublishBarProps) {
  const [submitState, setSubmitState] = useState<PublishSubmitState>({ status: "idle" });
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const checks = buildPublishChecks(detail);
  const publication = detail.publication;
  const isSubmitting = submitState.status === "submitting";
  const canPublish =
    checks.length === 0 && !isSubmitting && (publication === null || detail.hasUnpublishedChanges);

  const publicPath = `/show/${detail.id}`;

  const handlePublish = () => {
    if (checks.length > 0) {
      return;
    }
    setSubmitState({ status: "submitting" });
    setCopyState("idle");
    new PublishAPI(detail.id).send().then(
      (response) => {
        setSubmitState({
          status: "succeeded",
          version: response.version,
          publishedAt: response.publishedAt,
        });
        onChanged();
      },
      (error: unknown) => {
        setSubmitState({ status: "failed", message: describeGalleryError(error) });
      },
    );
  };

  const handleCopy = () => {
    const absoluteUrl = `${window.location.origin}${publicPath}`;
    const clipboard = navigator.clipboard;
    if (clipboard === undefined) {
      setCopyState("failed");
      return;
    }
    clipboard.writeText(absoluteUrl).then(
      () => setCopyState("copied"),
      () => setCopyState("failed"),
    );
  };

  const publishLabel = publication === null ? "发布展览" : "更新发布";

  return (
    <section aria-labelledby="publish-bar-title" className="rounded-xl border border-line bg-surface p-6 shadow-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 id="publish-bar-title" className="font-serif text-h2 text-ink">
            发布
          </h2>
          <p className="mt-2 text-caption text-muted">
            {publication === null
              ? "发布后生成一个可分享的公开记忆场景；草稿内容不会提前公开。"
              : `已发布 v${publication.version} · 发布于 ${formatUpdatedAt(publication.publishedAt)}。`}
          </p>
        </div>
        {publication === null ? null : detail.hasUnpublishedChanges ? (
          <span className="text-caption text-accent">草稿有未发布修改</span>
        ) : (
          <span className="text-caption text-muted">公开页与草稿一致</span>
        )}
      </header>

      {checks.length > 0 ? (
        <div className="mt-4">
          <p className="text-caption text-muted">发布前还需要：</p>
          <ul className="mt-2 flex flex-col gap-1">
            {checks.map((check) => (
              <li key={check.code} className="text-caption text-danger">
                {check.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {publication !== null ? (
        <div className="mt-4 rounded-md border border-line bg-bg px-4 py-3">
          <p className="text-caption text-muted">公开链接</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <a
              className="break-all text-body text-accent underline underline-offset-4 transition-colors duration-150 hover:text-ink motion-reduce:transition-none"
              href={publicPath}
              target="_blank"
              rel="noreferrer"
            >
              {publicPath}
            </a>
            <Button variant="secondary" size="sm" onClick={handleCopy}>
              复制链接
            </Button>
          </div>
          {copyState === "copied" ? (
            <p role="status" className="mt-2 text-caption text-accent">
              已复制公开链接。
            </p>
          ) : copyState === "failed" ? (
            <p role="status" className="mt-2 text-caption text-muted">
              复制不可用，请手动复制上面的链接。
            </p>
          ) : null}
        </div>
      ) : null}

      {submitState.status === "failed" ? (
        <p role="alert" className="mt-4 text-caption text-danger">
          {submitState.message}
        </p>
      ) : null}
      {submitState.status === "succeeded" ? (
        <p role="status" className="mt-4 text-caption text-accent">
          已发布 v{submitState.version}（{formatUpdatedAt(submitState.publishedAt)}）。
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          loading={isSubmitting}
          disabled={!canPublish}
          title={
            checks.length > 0
              ? "请先满足上方发布条件"
              : publication !== null && !detail.hasUnpublishedChanges
                ? "公开页已是最新，无需更新发布"
                : publishLabel
          }
          onClick={handlePublish}
        >
          {publishLabel}
        </Button>
        {isSubmitting ? <span className="text-caption text-muted">正在发布，请稍候…</span> : null}
      </div>
    </section>
  );
}
