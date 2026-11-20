import { useState } from "react";
import type { FormEvent } from "react";
import { CreateExhibitionAPI } from "../../../apis/gallery/CreateExhibitionAPI";
import { Button, Dialog, Input } from "../../../components/ui";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";

export interface CreateExhibitionDialogProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}

const TITLE_REQUIRED_MESSAGE = "请输入展览标题";

/** 新建展览：表单本地状态保持简单（rules 60），创建成功后由页面刷新列表。 */
export function CreateExhibitionDialog({ open, onClose, onCreated }: CreateExhibitionDialogProps) {
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleClose = () => {
    if (isSubmitting) {
      return;
    }
    setTitle("");
    setError(null);
    onClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setError(TITLE_REQUIRED_MESSAGE);
      return;
    }

    setError(null);
    setIsSubmitting(true);
    new CreateExhibitionAPI(trimmedTitle).send().then(
      () => {
        setIsSubmitting(false);
        setTitle("");
        onCreated();
        onClose();
      },
      (submitError: unknown) => {
        setIsSubmitting(false);
        setError(describeGalleryError(submitError));
      },
    );
  };

  return (
    <Dialog
      open={open}
      title="新建展览"
      onClose={handleClose}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={handleClose} disabled={isSubmitting}>
            取消
          </Button>
          <Button type="submit" form="create-exhibition-form" size="sm" loading={isSubmitting}>
            创建
          </Button>
        </>
      }
    >
      <form
        id="create-exhibition-form"
        className="flex flex-col gap-4"
        onSubmit={handleSubmit}
        noValidate
      >
        <Input
          label="展览标题"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={error ?? undefined}
          disabled={isSubmitting}
          autoFocus
        />
      </form>
      <p className="mt-4 text-caption">创建后进入工作台添加照片；标题之后也可以修改。</p>
    </Dialog>
  );
}
