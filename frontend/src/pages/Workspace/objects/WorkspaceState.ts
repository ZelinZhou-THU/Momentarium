import type { ExhibitionDetail } from "../../../objects/gallery/ExhibitionDetail";
import type { UploadProgress } from "../../../apis/shared/send";
import type { UploadFailure } from "../../../objects/gallery/UploadPhotosResponse";

/** 工作台展览详情区域：loading / ready / error（spec 11.3）。 */
export type WorkspaceDetailState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly detail: ExhibitionDetail }
  | { readonly status: "error"; readonly message: string };

/** 上传状态：一次上传提交内保持；完成后展示成功数量与逐文件失败。 */
export type UploadPhotosState =
  | { readonly status: "idle" }
  | {
      readonly status: "uploading";
      readonly fileCount: number;
      /** 所选文件的原始总字节（显示"共 65.8 MB"）。 */
      readonly fileBytes: number;
      /** 浏览器报告的请求体发送进度；尚未收到第一次回调时为 null。 */
      readonly progress: UploadProgress | null;
    }
  | { readonly status: "failed"; readonly message: string }
  | {
      readonly status: "completed";
      readonly uploadedCount: number;
      readonly failures: readonly UploadFailure[];
    };
