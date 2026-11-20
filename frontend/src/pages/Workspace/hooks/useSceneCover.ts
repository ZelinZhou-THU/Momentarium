import { useMemo, useRef } from "react";
import { UploadCoverRenderAPI } from "../../../apis/gallery/UploadCoverRenderAPI";
import { SetCoverAPI } from "../../../apis/gallery/SetCoverAPI";
import type { ImageCapture } from "../../../scene/contract";

const captureFile = async (capture: ImageCapture): Promise<File> => {
  const image = new Image();
  image.src = capture.dataUrl;
  await image.decode();
  const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法处理截图");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const encode = (quality: number): Promise<Blob> => new Promise((resolve, reject) =>
    canvas.toBlob(value => value ? resolve(value) : reject(new Error("无法编码截图")), "image/jpeg", quality),
  );
  const first = await encode(0.85);
  const blob = first.size <= 4 * 1024 * 1024 ? first : await encode(0.55);
  if (blob.size > 4 * 1024 * 1024) throw new Error("截图超过 4MB，请调整视角后重试");
  return new File([blob], "cover.jpg", { type: "image/jpeg" });
};

export interface SceneCoverDependencies {
  readonly encode: (capture: ImageCapture) => Promise<File>;
  readonly upload: (file: File, signal: AbortSignal) => Promise<string>;
  readonly set: (key: string, signal: AbortSignal) => Promise<void>;
  readonly refresh: () => void;
}

/** 设置失败时保留上传结果，同一运行的重试无需再次上传。 */
export const createSceneCoverSaver = (dependencies: SceneCoverDependencies) => {
  let uploaded: { runId: string; key: string } | null = null;
  let generation = 0;
  let controller: AbortController | null = null;
  const cancel = (): void => { generation += 1; controller?.abort(); controller = null; uploaded = null; };
  const save = async (runId: string, capture: ImageCapture): Promise<void> => {
    const current = generation;
    controller = new AbortController();
    const signal = controller.signal;
    const ensureCurrent = (): void => {
      if (current !== generation) throw new DOMException("取消封面设置", "AbortError");
    };
    const key = uploaded?.runId === runId ? uploaded.key : await (async () => {
      const file = await dependencies.encode(capture);
      ensureCurrent();
      return dependencies.upload(file, signal);
    })();
    ensureCurrent();
    uploaded = { runId, key };
    await dependencies.set(key, signal);
    ensureCurrent();
    uploaded = null;
    dependencies.refresh();
  };
  return { save, cancel };
};

export const useSceneCover = (exhibitionId: string, onChanged: () => void) => {
  const refreshRef = useRef(onChanged);
  refreshRef.current = onChanged;
  const saver = useMemo(() => createSceneCoverSaver({
    encode: captureFile,
    upload: async (file, signal) => (await new UploadCoverRenderAPI(exhibitionId, file).send({ signal })).renderKey,
    set: async (key, signal) => { await new SetCoverAPI(exhibitionId, "render", null, key).send({ signal }); },
    refresh: () => refreshRef.current(),
  }), [exhibitionId]);
  return { saveSceneCover: saver.save, cancelSceneCover: saver.cancel };
};
