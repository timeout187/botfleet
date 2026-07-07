import { describe, it, expect } from "vitest";
import { restrictionsSatisfied } from "@/lib/agents/enrollment";

describe("restrictionsSatisfied", () => {
  it("accepts anything when there are no restrictions", () => {
    expect(restrictionsSatisfied(null, {})).toBe(true);
    expect(restrictionsSatisfied(null, { environment: "production" })).toBe(true);
  });

  it("rejects a mismatched environment", () => {
    const restrictions = { environment: "production" };
    expect(restrictionsSatisfied(restrictions, { environment: "staging" })).toBe(false);
    expect(restrictionsSatisfied(restrictions, {})).toBe(false);
  });

  it("accepts a matching environment", () => {
    const restrictions = { environment: "production" };
    expect(restrictionsSatisfied(restrictions, { environment: "production" })).toBe(true);
  });

  it("enforces every required label, not just some", () => {
    const restrictions = { requiredLabels: { runner: "docker", tier: "premium" } };
    expect(restrictionsSatisfied(restrictions, { runner: "docker", tier: "premium" })).toBe(true);
    expect(restrictionsSatisfied(restrictions, { runner: "docker", tier: "standard" })).toBe(false);
    expect(restrictionsSatisfied(restrictions, { runner: "docker" })).toBe(false);
  });

  it("combines environment and label restrictions (both must hold)", () => {
    const restrictions = { environment: "production", requiredLabels: { region: "eu-central" } };
    expect(
      restrictionsSatisfied(restrictions, { environment: "production", region: "eu-central" }),
    ).toBe(true);
    expect(
      restrictionsSatisfied(restrictions, { environment: "production", region: "us-east" }),
    ).toBe(false);
  });
});
