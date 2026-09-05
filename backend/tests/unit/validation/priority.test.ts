import { parsePriority } from "../../../src/validation/priority.js";
import { ValidationError } from "../../../src/validation/errors.js";

describe("validation/priority", () => {
  describe("parsePriority", () => {
    it("returns fallback for null or undefined", () => {
      expect(parsePriority(undefined)).toBe("medium");
      expect(parsePriority(null)).toBe("medium");
      expect(parsePriority(undefined, "low")).toBe("low");
    });

    it("accepts valid priority values case-insensitively", () => {
      expect(parsePriority("low")).toBe("low");
      expect(parsePriority("MEDIUM")).toBe("medium");
      expect(parsePriority("High")).toBe("high");
    });

    it("rejects non-string priority", () => {
      expect(() => parsePriority(1)).toThrow(ValidationError);
      expect(() => parsePriority(true)).toThrow(ValidationError);
    });

    it("rejects invalid priority strings", () => {
      expect(() => parsePriority("urgent")).toThrow(ValidationError);
      expect(() => parsePriority("")).toThrow(ValidationError);
    });
  });
});
