import { useState } from "react";
import { DeleteExhibitionAPI } from "../../../apis/gallery/DeleteExhibitionAPI";
import { ConfirmDialog } from "../../../components/ui";
import type { ExhibitionSummary } from "../../../objects/gallery/ExhibitionSummary";
import { describeGalleryError } from "../../../apis/gallery/describeGalleryError";

export interface DeleteExhibitionDialogProps {
  readonly target: ExhibitionSummary | null;
  readonly onClose: () => void;
  readonly onDeleted: () => void;
  /** 删除失败时关闭确认框并用页面级 Toast 提示（原生 dialog 处于顶层，Toast 放框内会被遮挡）。 */
  readonly onFailed: (message: string) => void;
}

export function DeleteExhibitionDialog({
  target,
  onClose,
  onDeleted,
  onFailed,
}: DeleteExhibitionDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCancel = () => {
    if (isDeleting) {
      return;
    }
    onClose();
  };

  const handleConfirm = () => {
    if (target === null) {
      return;
    }
    setIsDeleting(true);
    new DeleteExhibitionAPI(target.id).send().then(
      () => {
        setIsDeleting(false);
        onDeleted();
        onClose();
      },
      (deleteError: unknown) => {
        setIsDeleting(false);
        onFailed(describeGalleryError(deleteError));
        onClose();
      },
    );
  };

  return (
    <ConfirmDialog
      open={target !== null}
      title="删除这个展览？"
      message={`「${target === null ? "" : target.title}」删除后不可恢复；已发布的快照会一并下线。`}
      confirmLabel="删除展览"
      tone="danger"
      loading={isDeleting}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  );
}
