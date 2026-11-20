import { describeApiError } from "../../apis/shared/describeApiError";
import type { SceneSandboxFailureCode } from "../sandbox";

const SCENE_REASON_MESSAGES = {
  PHOTO_COUNT: "至少需要 3 张照片才能生成场景。",
  PHOTO_UNGROUPED: "还有照片没有被分到章节，请先完成策展。",
  GROUP_EMPTY: "存在空章节，请先补充照片或删除该章节。",
  MODEL_FAILURE: "AI 服务暂时不可用，请稍后重试。",
  SCENE_NOT_READY: "场景还没有准备好截图，请稍候重试。",
  SCENE_STALE: "策展已更新，请重新生成场景。",
  SCENE_INSTRUCTION_INVALID: "修订指令需要 1–500 个字，且不能包含 NUL 等控制字符（可保留换行与制表符）。",
  SCENE_REVISION_TOO_LARGE: "这次修订的上下文过大，无法发送；请缩短指令后重试。",
  SCENE_REVISION_STALE: "当前场景或素材已经变化，这个修订无法继续；请刷新后基于当前场景重新修订。",
  SCENE_RUN_NOT_ACCEPTABLE: "这次运行不是可采用的修订候选，或父版本已不是当前场景，不能采用。",
  SCENE_RUN_ACTIVE: "有场景正在生成，请等它结束或停止后再试。",
} as const;

/** 场景区域统一的错误文案：优先契约 reason，其次 401/网络/解码兜底。 */
export const describeSceneError = (error: unknown): string =>
  describeApiError(error, SCENE_REASON_MESSAGES, "登录已失效，请重新登录。");

const SANDBOX_FAILURE_MESSAGES: Record<SceneSandboxFailureCode, string> = {
  WEBGL_UNAVAILABLE: "当前浏览器不可用 WebGL，无法预览三维场景。",
  BUILD_FAILED: "场景代码在沙箱中执行失败，请重新生成。",
  BUILD_TIMEOUT: "场景代码在 8 秒内没有完成构建，已按失败处理。",
  CODE_INVALID: "场景代码无法执行（结构不合法），请重新生成。",
  TEXTURE_LOAD_FAILED: "照片纹理加载失败，请重试。",
  PHOTOS_INVALID: "传给沙箱的照片数据不合法，请重试。",
  RUNTIME_VERSION_MISMATCH: "沙箱运行时版本不匹配，请刷新页面。",
  SESSION_ALREADY_INITIALIZED: "沙箱会话重复初始化，请刷新页面。",
  NOT_READY: "场景尚未就绪，无法截图。",
  CAPTURE_BUSY: "截图正在进行中，请稍候。",
  CAPTURE_TAINTED: "画布被跨源内容污染，无法截图。",
  CAPTURE_FAILED: "场景截图失败，请重试。",
  CAPTURE_TIMEOUT: "截图超时，请重试。",
  SESSION_TIMEOUT: "渲染会话超时，已结束本次预览。",
  FRAME_LOAD_TIMEOUT: "沙箱加载超时，请重试。",
  RESOURCE_LOAD_FAILED: "无法加载 three.js（检查后端 /vendor 路由），请稍后重试。",
  PROTOCOL_INVALID: "沙箱消息异常，请刷新页面重试。",
  RUNTIME_FAILED: "沙箱运行时异常，请重试。",
};

/** 沙箱失败 → 面向用户的中文提示；保留错误码便于排查。 */
export const describeSandboxFailure = (code: SceneSandboxFailureCode, message: string): string =>
  `${SANDBOX_FAILURE_MESSAGES[code]}（${code}${message.length > 0 ? `：${message}` : ""}）`;
