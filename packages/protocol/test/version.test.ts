import { describe, it, expect } from "vitest";
import { PROTOCOL_VERSION, isSupportedProtocolVersion } from "../src/index";

describe("protocol version", () => {
  it("supports its own current version", () => {
    expect(isSupportedProtocolVersion(PROTOCOL_VERSION)).toBe(true);
  });

  it("rejects a version that doesn't exist yet", () => {
    expect(isSupportedProtocolVersion(PROTOCOL_VERSION + 1)).toBe(false);
  });

  it("rejects version 0 and negative versions", () => {
    expect(isSupportedProtocolVersion(0)).toBe(false);
    expect(isSupportedProtocolVersion(-1)).toBe(false);
  });
});
