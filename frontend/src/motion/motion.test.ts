import { describe, expect, it } from "vitest";
import { staggerDelay } from "./stagger";
import {
  TAB_INDICATOR_TRANSITION_NAME,
  TOP_BAR_TRANSITION_NAME,
  photoTransitionName,
  tabLabelTransitionName,
} from "./transitionNames";

describe("motion", () => {
  it("逐项进场按 40ms 错开，最多等 320ms", () => {
    expect([0, 1, 2, 8, 30].map(staggerDelay)).toEqual(["0ms", "40ms", "80ms", "320ms", "320ms"]);
  });

  it("共享元素名字按类别加前缀，是合法的 CSS 标识符", () => {
    const id = "9db5fb44-77a8-4705-92be-db55634b81d8";
    [
      photoTransitionName(id),
      TOP_BAR_TRANSITION_NAME,
      TAB_INDICATOR_TRANSITION_NAME,
      tabLabelTransitionName("curation"),
    ].forEach((name) => expect(name).toMatch(/^[a-z][a-z0-9-]*$/));
  });
});
