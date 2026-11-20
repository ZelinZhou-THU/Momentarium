import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { Button } from "./Button";
import { classNames } from "./classNames";

export interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  // 补充说明，例如格式、大小限制。
  hint?: string;
  // 上传进度/结果位：调用方放 Spinner、进度文字或自己的进度条。
  status?: ReactNode;
}

// 上传拖拽区：拖拽态用 accentSoft 提亮；选择文件由隐藏 input + 按钮触发，保持键盘可用。
export function UploadDropzone({
  onFilesSelected,
  accept = "image/jpeg,image/png",
  multiple = true,
  disabled = false,
  hint,
  status,
}: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFiles = (files: FileList | null): void => {
    if (disabled || files === null || files.length === 0) return;
    onFilesSelected(Array.from(files));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (!disabled) setIsDragging(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragging(false);
    handleFiles(event.dataTransfer.files);
  };

  return (
    <div
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={classNames(
        "flex flex-col items-center gap-4 rounded-xl border border-dashed px-6 py-10 text-center transition-colors duration-150 ease-out motion-reduce:transition-none",
        disabled
          ? "border-line bg-bg opacity-50"
          : isDragging
            ? "border-accent bg-accentSoft"
            : "border-line bg-surface",
      )}
    >
      <p className="text-body text-muted">{isDragging ? "松开即可加入这批照片" : "把照片拖到这里"}</p>
      <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
        选择照片
      </Button>
      {hint ? <p className="text-caption text-muted">{hint}</p> : null}
      {status ? <div className="w-full">{status}</div> : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          handleFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
