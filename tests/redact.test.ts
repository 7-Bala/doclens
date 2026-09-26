import { describe, expect, it } from "vitest";
import { healWrappedIdentifiers, redact } from "@/lib/redact";

describe("redact", () => {
  it("removes Indian personal identifiers", () => {
    const input =
      "Call 9876543210 or +91 91234 56789, mail a.b@example.com, PAN ABCDE1234F, Aadhaar 2345 6789 0123, IFSC HDFC0001234, A/c 123456789012345.";
    const { text, counts, total } = redact(input);

    expect(text).not.toMatch(/9876543210|91234|a\.b@example\.com|ABCDE1234F|2345 6789 0123|HDFC0001234|123456789012345/);
    expect(counts).toMatchObject({ PHONE: 2, EMAIL: 1, PAN: 1, AADHAAR: 1, IFSC: 1, ACCOUNT: 1 });
    expect(total).toBe(7);
  });

  it("keeps money amounts, dates and clause numbers intact", () => {
    const input = "Rent of Rs. 1,50,000 is due on 05/10/2026 under Clause 4.2 for 11 months.";
    const { text, total } = redact(input);
    expect(text).toBe(input);
    expect(total).toBe(0);
  });

  it("is deterministic", () => {
    const input = "Contact ramesh@example.com";
    expect(redact(input)).toEqual(redact(input));
  });
});

describe("healWrappedIdentifiers (PDF line-wrap regressions)", () => {
  it("rejoins an email split across lines so no fragment leaks", () => {
    const { text } = redact("email ramesh.\nkumar@example.com, PAN");
    expect(text).toContain("[EMAIL REDACTED]");
    expect(text).not.toContain("ramesh");
  });

  it("rejoins digit runs split by a wrap", () => {
    expect(healWrappedIdentifiers("Aadhaar 2345 67\n89 0123")).toBe("Aadhaar 2345 6789 0123");
  });

  it("never merges a numbered clause heading into the previous line", () => {
    expect(healWrappedIdentifiers("valid for 5\n6. TERMINATION")).toBe("valid for 5\n6. TERMINATION");
  });

  it("leaves ordinary prose lines alone", () => {
    expect(healWrappedIdentifiers("The tenant shall\npay rent.")).toBe("The tenant shall\npay rent.");
  });
});
