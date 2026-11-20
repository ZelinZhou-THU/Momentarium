import { describe, expect, it } from "vitest";
import type { PublicPlayingScene, PublicShowState } from "../objects/PublicShowState";
import type { PublicExhibitionView } from "../../../objects/gallery/PublicExhibitionView";
import { createInitialPublicShowState, reducePublicShow } from "./reducePublicShow";
import {
  createPublicExhibitionFixture,
  createPublicPlayingSceneFixture,
} from "../mocks/publicShowFixtures";

const exhibition = createPublicExhibitionFixture();
const playing = createPublicPlayingSceneFixture(exhibition);

const apply = (state: PublicShowState, ...events: Parameters<typeof reducePublicShow>[1][]): PublicShowState =>
  events.reduce(reducePublicShow, state);

describe("公开页状态机（先导页 → 3D）", () => {
  it("初始为 loading；加载成功进入 ready（先导页，playing=null）", () => {
    const loading = createInitialPublicShowState();
    expect(loading.status).toBe("loading");
    const ready = apply(loading, { type: "load_succeeded", exhibition });
    expect(ready.status).toBe("ready");
    if (ready.status === "ready") {
      expect(ready.playing).toBeNull();
      expect(ready.exhibition.title).toBe("济州岛的海与山");
    }
  });

  it("未发布/链接失效 → notfound；加载失败 → error（可重试）", () => {
    expect(apply(createInitialPublicShowState(), { type: "load_not_found" }).status).toBe("notfound");
    const errored = apply(createInitialPublicShowState(), { type: "load_failed", message: "无法连接服务器" });
    expect(errored.status).toBe("error");
    if (errored.status === "error") expect(errored.message).toBe("无法连接服务器");
  });

  it("先导页点击进入：ready(null) → entering → ready(playing) → 退出回先导页", () => {
    const intro = apply(createInitialPublicShowState(), { type: "load_succeeded", exhibition });
    const entering = apply(intro, { type: "enter_started" });
    expect(entering.status).toBe("entering");

    const scene = apply(entering, { type: "enter_succeeded", playing });
    expect(scene.status).toBe("ready");
    if (scene.status === "ready") {
      expect(scene.playing?.scene.runtimeVersion).toBe("1");
      expect(scene.playing?.photos).toHaveLength(3);
    }

    const back = apply(scene, { type: "exit" });
    expect(back.status).toBe("ready");
    if (back.status === "ready") expect(back.playing).toBeNull();
  });

  it("enter 只在先导页生效；enter_failed 进入可重试 error", () => {
    const loading = createInitialPublicShowState();
    expect(apply(loading, { type: "enter_started" }).status).toBe("loading");

    const entering = apply(createInitialPublicShowState(), { type: "load_succeeded", exhibition }, { type: "enter_started" });
    const failed = apply(entering, { type: "enter_failed", message: "场景暂不可用" });
    expect(failed.status).toBe("error");
    if (failed.status === "error") expect(failed.message).toBe("场景暂不可用");
  });

  it("playing 状态下重复 enter 不会打断 3D", () => {
    const ready = apply(
      createInitialPublicShowState(),
      { type: "load_succeeded", exhibition },
      { type: "enter_started" },
      { type: "enter_succeeded", playing },
    );
    expect(apply(ready, { type: "enter_started" })).toBe(ready);
  });

  it("覆盖页面需要的全部状态：loading/entering/ready/notfound/error", () => {
    const visited = new Set<string>();
    let state = createInitialPublicShowState();
    visited.add(state.status);
    state = apply(state, { type: "load_succeeded", exhibition });
    visited.add(state.status);
    state = apply(state, { type: "enter_started" });
    visited.add(state.status);
    state = apply(state, { type: "enter_succeeded", playing });
    visited.add(state.status);
    const notfound = apply(createInitialPublicShowState(), { type: "load_not_found" });
    visited.add(notfound.status);
    const error = apply(createInitialPublicShowState(), { type: "load_failed", message: "x" });
    visited.add(error.status);
    expect([...visited].sort()).toEqual(["entering", "error", "loading", "notfound", "ready"]);
  });

  it("playing 结构包含 code、runtimeVersion 与全部展示图", () => {
    const scene: PublicPlayingScene = playing;
    expect(scene.scene.code).toContain("function build");
    expect(scene.photos.map((photo) => photo.id)).toEqual(
      exhibition.photos.map((photo) => photo.id),
    );
  });

  it("fixture 明确是本地 mock（非最终证据）", () => {
    const fixture: PublicExhibitionView = createPublicExhibitionFixture();
    expect(fixture.version).toBe(2);
    expect(fixture.groups).toHaveLength(2);
    expect(fixture.publishedAt).toBe("2026-10-27T15:00:00Z");
  });
});
