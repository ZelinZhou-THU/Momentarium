import type { PublicExhibitionView } from "../../../objects/gallery/PublicExhibitionView";
import type { PublicPlayingScene, PublicShowState } from "../objects/PublicShowState";

export type PublicShowEvent =
  | { readonly type: "load_started" }
  | { readonly type: "load_succeeded"; readonly exhibition: PublicExhibitionView }
  | { readonly type: "load_not_found" }
  | { readonly type: "load_failed"; readonly message: string }
  | { readonly type: "enter_started" }
  | { readonly type: "enter_succeeded"; readonly playing: PublicPlayingScene }
  | { readonly type: "enter_failed"; readonly message: string }
  | { readonly type: "exit" };

export const createInitialPublicShowState = (): PublicShowState => ({ status: "loading" });

/** 公开页纯状态机：进入 3D 只在 ready（先导页）触发；进入失败回 error 由页面给重试。 */
export const reducePublicShow = (state: PublicShowState, event: PublicShowEvent): PublicShowState => {
  switch (event.type) {
    case "load_started":
      return { status: "loading" };
    case "load_succeeded":
      return { status: "ready", exhibition: event.exhibition, playing: null };
    case "load_not_found":
      return { status: "notfound" };
    case "load_failed":
      return { status: "error", message: event.message };
    case "enter_started":
      return state.status === "ready" && state.playing === null
        ? { status: "entering", exhibition: state.exhibition }
        : state;
    case "enter_succeeded":
      return state.status === "entering"
        ? { status: "ready", exhibition: state.exhibition, playing: event.playing }
        : state;
    case "enter_failed":
      return state.status === "entering" ? { status: "error", message: event.message } : state;
    case "exit":
      return state.status === "ready" && state.playing !== null
        ? { status: "ready", exhibition: state.exhibition, playing: null }
        : state;
  }
};
