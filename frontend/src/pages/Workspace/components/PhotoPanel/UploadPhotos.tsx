import { useState } from "react";
import { UploadPhotosAPI } from "../../../../apis/gallery/UploadPhotosAPI";
import { Spinner, UploadDropzone } from "../../../../components/ui";
import { describeGalleryError } from "../../../../apis/gallery/describeGalleryError";
import { describeUploadFailure } from "../../functions/describeUploadFailure";
import { describeUploadProgress } from "../../functions/describeUploadProgress";
import type { UploadPhotosState } from "../../objects/WorkspaceState";

export interface UploadPhotosProps {
  readonly exhibitionId: string;
  readonly onUploaded: () => void;
}

/** 上传照片：多选/拖拽、上传中禁用、逐文件失败原因、成功后由页面刷新详情。 */
export function UploadPhotos({ exhibitionId, onUploaded }: UploadPhotosProps) {
  const [uploadState, setUploadState] = useState<UploadPhotosState>({ status: "idle" });

  const handleFilesSelected = (files: File[]) => {
    const fileCount = files.length;
    const fileBytes = files.reduce((sum, file) => sum + file.size, 0);
    setUploadState({ status: "uploading", fileCount, fileBytes, progress: null });
    new UploadPhotosAPI(exhibitionId, files)
      .send({ onUploadProgress: (progress) => setUploadState({ status: "uploading", fileCount, fileBytes, progress }) })
      .then(
      (response) => {
        setUploadState({
          status: "completed",
          uploadedCount: response.photos.length,
          failures: response.failures,
        });
        if (response.photos.length > 0) {
          onUploaded();
        }
      },
      (error: unknown) => {
        setUploadState({ status: "failed", message: describeGalleryError(error) });
      },
    );
  };

  const isUploading = uploadState.status === "uploading";
  const progressView =
    uploadState.status === "uploading"
      ? describeUploadProgress(uploadState.fileCount, uploadState.fileBytes, uploadState.progress)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-caption text-muted">上传照片</h3>
      <UploadDropzone
        onFilesSelected={handleFilesSelected}
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={isUploading}
        hint="JPG / PNG / WebP，单张 ≤15MB，每个展览最多 30 张"
        status={
          progressView !== null ? (
            <div className="flex flex-col gap-2">
              <Spinner size="sm" label={progressView.label} />
              {progressView.percent !== null ? (
                <progress
                  className="h-1.5 w-full overflow-hidden rounded-full bg-line [&::-moz-progress-bar]:bg-accent [&::-webkit-progress-bar]:bg-line [&::-webkit-progress-value]:bg-accent"
                  value={progressView.percent}
                  max={100}
                  aria-label={`上传进度 ${progressView.percent}%`}
                />
              ) : null}
            </div>
          ) : null
        }
      />
      {uploadState.status === "completed" ? (
        <div role="status" className="flex flex-col gap-2 text-caption">
          <p className="text-muted">已上传 {uploadState.uploadedCount} 张照片。</p>
          {uploadState.failures.length > 0 ? (
            <ul className="flex flex-col gap-1 text-danger">
              {uploadState.failures.map((failure) => (
                <li key={failure.fileName}>
                  {failure.fileName}：{describeUploadFailure(failure.reason)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {uploadState.status === "failed" ? (
        <p role="alert" className="text-caption text-danger">
          {uploadState.message}
        </p>
      ) : null}
    </div>
  );
}
