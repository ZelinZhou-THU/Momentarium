import { describe, expect, it } from "vitest";
import { RUNTIME_SOURCE } from "./runtime";

class Failure extends Error {
  constructor(readonly code: string, message: string, readonly phase: string, readonly original?: unknown) { super(message); }
}

const compileRuntimeScene = (): ((code: string) => unknown) => {
  const start = RUNTIME_SOURCE.indexOf("const isCallable =");
  const end = RUNTIME_SOURCE.indexOf("const createContext =", start);
  if (start < 0 || end < 0) throw new Error("runtime compiler not found");
  return new Function("RuntimeFailure", "describeError", `${RUNTIME_SOURCE.slice(start, end)}; return compileSceneCode;`)(Failure, String);
};

describe("runtime scene compiler", () => {
  it("classifies a syntax error as CODE_INVALID in build and retains the original", () => {
    const compile = compileRuntimeScene();
    expect(() => compile("function build(ctx){const = ;}")).toThrow(Failure);
    try { compile("function build(ctx){const = ;}"); } catch (error) {
      expect(error).toMatchObject({ code: "CODE_INVALID", phase: "build", original: expect.any(SyntaxError) });
    }
  });
  it("classifies an exception thrown by build as BUILD_FAILED", () => {
    const start = RUNTIME_SOURCE.indexOf("const executeBuild =");
    const end = RUNTIME_SOURCE.indexOf("const pushFrameTime =", start);
    const execute = new Function("compileSceneCode", "createContext", "RuntimeFailure", "describeError", "locateInSceneCode", "state", `${RUNTIME_SOURCE.slice(start, end)}; return executeBuild;`)(
      () => () => { throw new Error("boom"); }, () => ({}), Failure, String, () => "", { timings: {} },
    );
    expect(() => execute("code")).toThrow(Failure);
    try { execute("code"); } catch (error) {
      expect(error).toMatchObject({ code: "BUILD_FAILED", phase: "build", original: expect.any(Error) });
    }
  });
});
