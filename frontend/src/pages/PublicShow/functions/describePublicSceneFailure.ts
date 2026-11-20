import type { SceneSandboxFailureCode } from "../../../scene/sandbox";

/**
 * 公开页沙箱失败文案（页面本地，不改 scene/ 宿主代码）。
 * 只消费 SceneSandboxFailureCode；真实错误细节保留在括注里便于排查。
 */
const FAILURE_MESSAGES: Record<SceneSandboxFailureCode, string> = {
  WEBGL_UNAVAILABLE: "当前浏览器不支持 WebGL，无法进入三维场景。可以换用新版 Chrome / Edge 再试。",
  RESOURCE_LOAD_FAILED: "三维运行时加载失败，请刷新页面重试。",
  FRAME_LOAD_TIMEOUT: "三维场景加载超时，请重试。",
  BUILD_FAILED: "场景构建失败，请重试。",
  BUILD_TIMEOUT: "场景构建超时，请重试。",
  CODE_INVALID: "场景数据异常，无法渲染。",
  TEXTURE_LOAD_FAILED: "照片纹理加载失败，请重试。",
  PHOTOS_INVALID: "照片数据异常，无法渲染。",
  RUNTIME_VERSION_MISMATCH: "场景版本不匹配，请刷新页面。",
  SESSION_ALREADY_INITIALIZED: "场景会话已结束，请刷新页面。",
  NOT_READY: "场景尚未就绪，请稍后重试。",
  CAPTURE_BUSY: "场景渲染中，请稍后。",
  CAPTURE_TAINTED: "场景渲染异常，请重试。",
  CAPTURE_FAILED: "场景渲染异常，请重试。",
  CAPTURE_TIMEOUT: "场景渲染超时，请重试。",
  SESSION_TIMEOUT: "本次游览会话已结束，请重新进入。",
  PROTOCOL_INVALID: "场景通信异常，请刷新页面。",
  RUNTIME_FAILED: "三维场景运行失败，请重试。",
};

export const describePublicSceneFailure = (code: SceneSandboxFailureCode): string =>
  FAILURE_MESSAGES[code];
