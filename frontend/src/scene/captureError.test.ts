import { describe, expect, it } from "vitest";
import { parseSandboxMessage } from "./contract";

describe("capture errors", () => {
  it("preserves the originating request id", () => {
    expect(parseSandboxMessage({ type: "error", runId: "run", requestId: "old", code: "CAPTURE_BUSY", phase: "capture", message: "busy", errors: [] })).toMatchObject({ requestId: "old" });
  });
});
