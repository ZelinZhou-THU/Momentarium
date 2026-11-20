import { getSessionToken } from "../../stores/sessionStore";
import { NetworkError, parseApiError } from "./ApiError";

/** 一次消息 API 调用：路由名 + 请求体（无请求消息不传 body，按契约发送 `{}`）。 */
export interface ApiRequest<TBody> {
  readonly routeName: string;
  readonly body?: TBody;
}

export interface ApiCallOptions {
  readonly signal?: AbortSignal;
}

export interface SendOptions extends ApiCallOptions {
  readonly authentication?: "session" | "none";
}

/** 非消息路由（如 multipart 上传）：完整路径 + 已组装的 FormData。 */
export interface FormDataRequest {
  readonly path: string;
  readonly formData: FormData;
}

/** 响应体解析失败时返回 null，交给错误分支处理（不抛出 JSON 解析异常）。 */
const readJsonPayload = (response: Response, signal?: AbortSignal | null): Promise<unknown> =>
  response.json().then(
    (payload: unknown) => payload,
    (error: unknown) => {
      if (signal?.aborted) throw signal.reason ?? new DOMException("请求已取消", "AbortError");
      if (error instanceof Error && error.name === "AbortError") throw error;
      return null;
    },
  );

const buildHeaders = (token: string | null): Record<string, string> =>
  token === null ? {} : { Authorization: `Bearer ${token}` };

const abortReason = (signal?: AbortSignal | null): unknown =>
  signal?.reason ?? new DOMException("请求已取消", "AbortError");

/** 拿到响应之后的统一处理：读 JSON、非 2xx 解析契约错误、2xx 交给 decode。 */
const settle = async <TResponse>(
  response: Response,
  signal: AbortSignal | null | undefined,
  decode: (payload: unknown) => TResponse,
): Promise<TResponse> => {
  const payload = await readJsonPayload(response, signal);
  if (signal?.aborted) throw abortReason(signal);

  if (!response.ok) {
    throw parseApiError(response.status, payload);
  }

  return decode(payload);
};

const execute = async <TResponse>(
  input: string,
  init: RequestInit,
  decode: (payload: unknown) => TResponse,
): Promise<TResponse> => {
  const response = await fetch(input, init).catch((error: unknown) => {
    if ((error instanceof Error && error.name === "AbortError") || init.signal?.aborted) throw error;
    throw new NetworkError();
  });
  return settle(response, init.signal, decode);
};

/**
 * 所有消息 API 的统一发送入口：POST /api/{routeName}、自动带 Bearer 令牌、
 * 非 2xx 解析契约错误结构为 ApiError、2xx 交给 decode 收窄为契约类型。
 */
export const send = <TBody, TResponse>(
  request: ApiRequest<TBody>,
  decode: (payload: unknown) => TResponse,
  options?: SendOptions,
): Promise<TResponse> =>
  execute(
    `/api/${request.routeName}`,
    {
      method: "POST",
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      headers: { "Content-Type": "application/json", ...buildHeaders(options?.authentication === "none" ? null : getSessionToken()) },
      body: JSON.stringify(request.body ?? {}),
    },
    decode,
  );

/**
 * 非消息路由的统一发送入口（multipart/form-data）。
 * Content-Type 交给浏览器生成 boundary，这里只补 Bearer 令牌。
 */
export const sendFormData = <TResponse>(
  request: FormDataRequest,
  decode: (payload: unknown) => TResponse,
  options?: SendOptions,
): Promise<TResponse> =>
  execute(
    request.path,
    {
      method: "POST",
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
      headers: buildHeaders(options?.authentication === "none" ? null : getSessionToken()),
      body: request.formData,
    },
    decode,
  );

/** 请求体的发送进度（整个 multipart 请求，含分隔符开销）。 */
export interface UploadProgress {
  readonly loadedBytes: number;
  readonly totalBytes: number;
}

export interface FormDataProgressOptions extends SendOptions {
  /** 浏览器每发出一段请求体回调一次；发送完毕时 loadedBytes === totalBytes（之后是服务端处理）。 */
  readonly onUploadProgress?: (progress: UploadProgress) => void;
}

/**
 * 用 XMLHttpRequest 发 multipart：fetch 拿不到上传进度。只负责把 XHR 包成 Response，
 * 错误、解码与 sendFormData 走同一套 settle 逻辑。
 */
const postWithUploadProgress = (
  path: string,
  headers: Record<string, string>,
  body: FormData,
  options: FormDataProgressOptions,
): Promise<Response> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const signal = options.signal;
    xhr.open("POST", path);
    Object.entries(headers).forEach(([name, value]) => xhr.setRequestHeader(name, value));
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable) options.onUploadProgress?.({ loadedBytes: event.loaded, totalBytes: event.total });
    });
    xhr.addEventListener("load", () =>
      resolve(new Response(xhr.status === 204 ? null : xhr.responseText, { status: xhr.status })),
    );
    xhr.addEventListener("error", () => reject(new NetworkError()));
    xhr.addEventListener("abort", () => reject(abortReason(signal)));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    if (signal?.aborted) {
      reject(abortReason(signal));
      return;
    }
    xhr.send(body);
  });

/** 带上传进度的 multipart 发送入口（批量原图上传用）；响应与错误语义同 sendFormData。 */
export const sendFormDataWithProgress = <TResponse>(
  request: FormDataRequest,
  decode: (payload: unknown) => TResponse,
  options: FormDataProgressOptions = {},
): Promise<TResponse> =>
  postWithUploadProgress(
    request.path,
    buildHeaders(options.authentication === "none" ? null : getSessionToken()),
    request.formData,
    options,
  ).then((response) => settle(response, options.signal, decode));
