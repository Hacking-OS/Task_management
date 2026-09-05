import {
  SEVERITIES,
  SEVERITY_LABELS,
  SEVERITY_RANK,
  emptySeverityCounts,
  formatSeverity,
  isHighSeverity,
  normalizeSeverity,
  parseSeverity,
  shortEntityId,
  shouldNotifySeverityChange,
} from "../../../src/validation/severity.js";

describe("validation/severity", () => {
  describe("normalizeSeverity", () => {
    it("returns null for non-string values", () => {
      expect(normalizeSeverity(undefined)).toBeNull();
      expect(normalizeSeverity(null)).toBeNull();
      expect(normalizeSeverity(42)).toBeNull();
      expect(normalizeSeverity({})).toBeNull();
    });

    it("accepts all canonical severities case-insensitively", () => {
      for (const severity of SEVERITIES) {
        expect(normalizeSeverity(severity)).toBe(severity);
        expect(normalizeSeverity(severity.toUpperCase())).toBe(severity);
      }
    });

    it("maps legacy severity aliases", () => {
      expect(normalizeSeverity("CRITICAL")).toBe("critical");
      expect(normalizeSeverity("High")).toBe("high");
      expect(normalizeSeverity("medium")).toBe("medium");
      expect(normalizeSeverity("low")).toBe("low");
    });

    it("returns null for unknown values", () => {
      expect(normalizeSeverity("unknown")).toBeNull();
      expect(normalizeSeverity("")).toBeNull();
    });
  });

  describe("parseSeverity", () => {
    it("returns parsed severity when valid", () => {
      expect(parseSeverity("blocker")).toBe("blocker");
      expect(parseSeverity("HIGH")).toBe("high");
    });

    it("returns fallback for null or undefined", () => {
      expect(parseSeverity(undefined)).toBe("medium");
      expect(parseSeverity(null)).toBe("medium");
      expect(parseSeverity(undefined, "low")).toBe("low");
    });

    it("throws for invalid values", () => {
      expect(() => parseSeverity("invalid")).toThrow(/Invalid severity/);
      expect(() => parseSeverity("invalid")).toThrow(SEVERITIES.join(", "));
    });
  });

  describe("formatSeverity", () => {
    it("returns human-readable labels", () => {
      for (const severity of SEVERITIES) {
        expect(formatSeverity(severity)).toBe(SEVERITY_LABELS[severity]);
      }
    });
  });

  describe("shortEntityId", () => {
    it("strips hyphens and uppercases first six chars", () => {
      expect(shortEntityId("a1b2-c3d4-e5f6-7890")).toBe("A1B2C3");
    });

    it("handles ids without hyphens", () => {
      expect(shortEntityId("abcdef123456")).toBe("ABCDEF");
    });
  });

  describe("shouldNotifySeverityChange", () => {
    it("returns false when severity unchanged", () => {
      expect(shouldNotifySeverityChange("medium", "medium")).toBe(false);
      expect(shouldNotifySeverityChange("critical", "critical")).toBe(false);
    });

    it("returns true when new severity is blocker, critical, or urgent", () => {
      expect(shouldNotifySeverityChange("low", "blocker")).toBe(true);
      expect(shouldNotifySeverityChange("medium", "critical")).toBe(true);
      expect(shouldNotifySeverityChange("low", "urgent")).toBe(true);
    });

    it("returns true when new severity rank is higher", () => {
      expect(shouldNotifySeverityChange("low", "high")).toBe(true);
      expect(shouldNotifySeverityChange("medium", "major")).toBe(true);
    });

    it("returns false when new severity rank is lower and not top-tier", () => {
      expect(shouldNotifySeverityChange("high", "low")).toBe(false);
      expect(shouldNotifySeverityChange("critical", "medium")).toBe(false);
    });
  });

  describe("emptySeverityCounts", () => {
    it("initializes all severities to zero", () => {
      const counts = emptySeverityCounts();
      for (const severity of SEVERITIES) {
        expect(counts[severity]).toBe(0);
      }
      expect(Object.keys(counts)).toHaveLength(SEVERITIES.length);
    });
  });

  describe("isHighSeverity", () => {
    it("returns true for high rank and above", () => {
      expect(isHighSeverity("high")).toBe(true);
      expect(isHighSeverity("critical")).toBe(true);
      expect(isHighSeverity("blocker")).toBe(true);
    });

    it("returns false below high rank", () => {
      expect(isHighSeverity("medium")).toBe(false);
      expect(isHighSeverity("low")).toBe(false);
      expect(isHighSeverity("informational")).toBe(false);
    });

    it("uses SEVERITY_RANK threshold at high", () => {
      expect(SEVERITY_RANK.high).toBe(12);
      expect(isHighSeverity("major")).toBe(false);
      expect(isHighSeverity("elevated")).toBe(false);
    });
  });
});
