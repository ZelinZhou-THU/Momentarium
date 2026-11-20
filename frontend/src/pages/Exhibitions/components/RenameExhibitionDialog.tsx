import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { GetExhibitionAPI } from "../../../apis/gallery/GetExhibitionAPI";
import { UpdateExhibitionMetaAPI } from "../../../apis/gallery/UpdateExhibitionMetaAPI";
import { Button, Dialog, ErrorState, Input, Spinner } from "../../../components/ui";
import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";

type RenameLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly detail: ExhibitionDetail }
  | { readonly status: "error"; readonly message: string };

export interface RenameExhibitionDialogProps {
  readonly target: ExhibitionSummary | null;
  readonly onClose: () => void;
  readonly onRenamed: () => void;
}

const TITLE_REQUIRED_MESSAGE = "请填写展览标题";

/**
 * 重命名展览：打开时用 getexhibition 读取 title + narrative（摘要里没有 narrative），
 * 保存时只改标题、原样带回叙事，避免误清空工作台里编辑过的内容。
 */
export function RenameExhibitionDialog({ target, onClose, onRenamed }: RenameExhibitionDialogProps) {
  const [loadState, setLoadState] = useState<RenameLoadState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [title, setTitle] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (target === null) {
      return;
    }
    setLoadState({ status: "loading" });
    setTitle("");
    setFieldError(null);
    setSubmitError(null);
    new GetExhibitionAPI(target.id).send().then(
      (detail) => {
        setLoadState({ status: "ready", detail });
        setTitle(detail.title);
      },
      (loadError: unknown) => {
        setLoadState({ status: "error", message: describeGalleryError(loadError) });
      },
    );
  }, [target, loadAttempt]);

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loadState.status !== "ready") {
      return;
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setFieldError(TITLE_REQUIRED_MESSAGE);
      return;
    }

    setFieldError(null);
    setSubmitError(null);
    setIsSubmitting(true);
    new UpdateExhibitionMetaAPI(loadState.detail.id, trimmedTitle, loadState.detail.narrative)
      .send()
      .then(
        () => {
          setIsSubmitting(false);
          onRenamed();
          onClose();
        },
        (submitFailure: unknown) => {
          setIsSubmitting(false);
          setSubmitError(describeGalleryError(submitFailure));
        },
      );
  };

  const footer = (
    <>
      <Button variant="secondary" size="sm" onClick={handleClose} disabled={isSubmitting}>
        取消
      </Button>
      <Button
        type="submit"
        form="rename-exhibition-form"
        size="sm"
        loading={isSubmitting}
        disabled={loadState.status !== "ready"}
      >
        保存
      </Button>
    </>
  );

  return (
    <Dialog open={target !== null} title="重命名展览" onClose={handleClose} footer={footer}>
      {loadState.status === "loading" ? (
        <Spinner label="正在读取展览" />
      ) : loadState.status === "error" ? (
        <ErrorState
          title="无法读取展览"
          message={loadState.message}
          onRetry={() => setLoadAttempt((attempt) => attempt + 1)}
        />
      ) : (
        <>
          <form
            id="rename-exhibition-form"
            className="flex flex-col gap-4"
            onSubmit={handleSubmit}
            noValidate
          >
            <Input
              label="展览标题"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              error={fieldError ?? undefined}
              disabled={isSubmitting}
              autoFocus
            />
          </form>
          {submitError === null ? null : <p className="mt-3 text-caption text-danger">{submitError}</p>}
          <p className="mt-4 text-caption">叙事、章节与照片在工作台里编辑。</p>
        </>
      )}
    </Dialog>
  );
}
