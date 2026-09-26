import { describe, expect, it } from "vitest";
import { POLICY, computeVerdict, type VerdictInput } from "@/lib/verdict";

const risk = (severity: VerdictInput["severity"], verification: VerdictInput["verification"] = "verified", title = `${severity} risk`): VerdictInput => ({
  title,
  severity,
  verification,
});

describe("computeVerdict", () => {
  it("recommends a lawyer when several high risks are confirmed, naming them", () => {
    const v = computeVerdict([risk("high", "verified", "Deposit forfeited"), risk("high", "approximate", "Tenant pays all repairs")], 0);
    expect(v.decision).toBe("consult");
    expect(v.reason).toContain("2 high-risk clauses");
    expect(v.reason).toContain('"Deposit forfeited"');
    expect(v.reason).toContain('"Tenant pays all repairs"');
  });

  it("summarises long lists instead of naming every clause", () => {
    const v = computeVerdict([risk("high", "verified", "A"), risk("high", "verified", "B"), risk("high", "verified", "C")], 0);
    expect(v.reason).toContain('"A", "B" and 1 more');
  });

  it("recommends a lawyer for one high risk plus several medium risks", () => {
    const mediums = Array.from({ length: POLICY.consultMediumWithOneHigh }, () => risk("medium"));
    expect(computeVerdict([risk("high"), ...mediums], 0).decision).toBe("consult");
  });

  it("recommends negotiating a single confirmed high risk", () => {
    const v = computeVerdict([risk("high", "verified", "Two-year bond"), risk("low")], 0);
    expect(v).toEqual({ decision: "negotiate", reason: 'One high-risk clause is confirmed: "Two-year bond". Ask for it to be changed before you sign.' });
  });

  it("recommends negotiating medium risks", () => {
    const v = computeVerdict([risk("medium", "verified", "Late fee")], 0);
    expect(v.decision).toBe("negotiate");
    expect(v.reason).toContain("1 clause works against you");
  });

  it("never escalates to consult on unverified evidence alone", () => {
    const v = computeVerdict([risk("high", "unverified"), risk("high", "unverified")], 0);
    expect(v.decision).toBe("negotiate");
    expect(v.reason).toContain("could not be matched");
  });

  it("never says sign while unverified concerns remain", () => {
    expect(computeVerdict([risk("low"), risk("medium", "unverified")], 0).decision).toBe("negotiate");
  });

  it("asks for missing protections even with no risky clauses", () => {
    const v = computeVerdict([], POLICY.negotiateMissingProtections);
    expect(v.decision).toBe("negotiate");
    expect(v.reason).toContain(`${POLICY.negotiateMissingProtections} standard protections are missing`);
  });

  it("says sign only for low risks and few missing protections", () => {
    expect(computeVerdict([risk("low"), risk("low")], 1)).toEqual({
      decision: "sign",
      reason: "Only 2 minor points to be aware of, and nothing that works strongly against you.",
    });
    expect(computeVerdict([], 0).decision).toBe("sign");
  });

  it("is deterministic", () => {
    const input = [risk("high"), risk("medium", "approximate")];
    expect(computeVerdict(input, 2)).toEqual(computeVerdict(input, 2));
  });
});
