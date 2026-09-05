import {
  validateCommentBody,
  validateCommentEntityType,
  validateDescription,
  validateEmail,
  validateEntityId,
  validateFileCategory,
  validateFilename,
  validateHours,
  validateLoginIdentifier,
  validatePassword,
  validatePriority,
  validateTimesheetEntityType,
  validateTitle,
  validateUsername,
  validateWorkDate,
  validateWorkspaceName,
} from "../../../src/validation/common.js";
import { ValidationError } from "../../../src/validation/errors.js";

describe("validation/common", () => {
  describe("validateUsername", () => {
    it("accepts valid username", () => {
      expect(validateUsername("demo_user")).toBe("demo_user");
    });

    it("rejects too short username", () => {
      expect(() => validateUsername("ab")).toThrow(ValidationError);
    });

    it("rejects overlong username", () => {
      expect(() => validateUsername("a".repeat(33))).toThrow(ValidationError);
    });

    it("rejects invalid characters", () => {
      expect(() => validateUsername("user@name")).toThrow(ValidationError);
    });

    it("rejects missing username", () => {
      expect(() => validateUsername(undefined)).toThrow(ValidationError);
    });
  });

  describe("validateEmail", () => {
    it("accepts valid email", () => {
      expect(validateEmail("User@Test.COM")).toBe("user@test.com");
    });

    it("rejects invalid email", () => {
      expect(() => validateEmail("not-an-email")).toThrow(ValidationError);
    });

    it("rejects overlong email", () => {
      expect(() => validateEmail(`${"a".repeat(250)}@test.com`)).toThrow(ValidationError);
    });
  });

  describe("validatePassword", () => {
    it("accepts strong password", () => {
      expect(validatePassword("SecurePass1")).toBe("SecurePass1");
    });

    it("rejects short password", () => {
      expect(() => validatePassword("Ab1")).toThrow(ValidationError);
    });

    it("rejects password without number", () => {
      expect(() => validatePassword("NoNumbers")).toThrow(ValidationError);
    });

    it("rejects password without letter", () => {
      expect(() => validatePassword("12345678")).toThrow(ValidationError);
    });
  });

  describe("validateLoginIdentifier", () => {
    it("accepts username or email string", () => {
      expect(validateLoginIdentifier("  demo  ")).toBe("demo");
    });

    it("rejects empty identifier", () => {
      expect(() => validateLoginIdentifier("   ")).toThrow(ValidationError);
    });
  });

  describe("validateWorkspaceName", () => {
    it("accepts valid workspace name", () => {
      expect(validateWorkspaceName("Acme Corp")).toBe("Acme Corp");
    });

    it("rejects too short name", () => {
      expect(() => validateWorkspaceName("A")).toThrow(ValidationError);
    });
  });

  describe("validateTitle", () => {
    it("accepts non-empty title", () => {
      expect(validateTitle("My Task")).toBe("My Task");
    });

    it("rejects empty title", () => {
      expect(() => validateTitle("   ")).toThrow(ValidationError);
    });

    it("rejects overlong title", () => {
      expect(() => validateTitle("a".repeat(201))).toThrow(ValidationError);
    });

    it("uses custom label in error messages", () => {
      expect(() => validateTitle(undefined, "Issue title")).toThrow(/Issue title is required/);
      expect(() => validateTitle("   ", "Issue title")).toThrow(/Issue title cannot be empty/);
    });
  });

  describe("validateDescription", () => {
    it("returns empty string for null or undefined", () => {
      expect(validateDescription(undefined)).toBe("");
      expect(validateDescription(null)).toBe("");
    });

    it("trims valid description", () => {
      expect(validateDescription("  hello world  ")).toBe("hello world");
    });

    it("rejects non-string description", () => {
      expect(() => validateDescription(123)).toThrow(ValidationError);
    });

    it("rejects description exceeding max length", () => {
      expect(() => validateDescription("x".repeat(10001))).toThrow(ValidationError);
      expect(() => validateDescription("x".repeat(101), 100)).toThrow(ValidationError);
    });
  });

  describe("validateCommentEntityType", () => {
    it("accepts task, issue, and subtask", () => {
      expect(validateCommentEntityType("task")).toBe("task");
      expect(validateCommentEntityType("issue")).toBe("issue");
      expect(validateCommentEntityType("subtask")).toBe("subtask");
    });

    it("rejects invalid entity types", () => {
      expect(() => validateCommentEntityType("workspace")).toThrow(ValidationError);
      expect(() => validateCommentEntityType(undefined)).toThrow(ValidationError);
    });
  });

  describe("validateFileCategory", () => {
    it("accepts valid categories", () => {
      expect(validateFileCategory("task")).toBe("task");
      expect(validateFileCategory("general")).toBe("general");
    });

    it("rejects invalid category", () => {
      expect(() => validateFileCategory("invalid")).toThrow(ValidationError);
      expect(() => validateFileCategory(undefined)).toThrow(ValidationError);
    });
  });

  describe("validateEntityId", () => {
    it("accepts non-empty trimmed id", () => {
      expect(validateEntityId("  abc-123  ")).toBe("abc-123");
    });

    it("rejects missing or empty id", () => {
      expect(() => validateEntityId(undefined)).toThrow(ValidationError);
      expect(() => validateEntityId("   ")).toThrow(ValidationError);
    });

    it("uses custom label in errors", () => {
      expect(() => validateEntityId("", "Task")).toThrow(/Task id is required/);
    });
  });

  describe("validatePriority", () => {
    it("returns fallback for null or undefined", () => {
      expect(validatePriority(undefined)).toBe("medium");
      expect(validatePriority(null, "low")).toBe("low");
    });

    it("accepts valid priorities", () => {
      expect(validatePriority("HIGH")).toBe("high");
    });

    it("rejects invalid priority", () => {
      expect(() => validatePriority("urgent")).toThrow(ValidationError);
      expect(() => validatePriority(1)).toThrow(ValidationError);
    });
  });

  describe("validateHours", () => {
    it("accepts numeric and string hours", () => {
      expect(validateHours(2.5)).toBe(2.5);
      expect(validateHours("3.456")).toBe(3.46);
    });

    it("rejects invalid hours", () => {
      expect(() => validateHours(undefined)).toThrow(ValidationError);
      expect(() => validateHours("abc")).toThrow(ValidationError);
      expect(() => validateHours(0)).toThrow(ValidationError);
      expect(() => validateHours(-1)).toThrow(ValidationError);
      expect(() => validateHours(25)).toThrow(ValidationError);
    });
  });

  describe("validateWorkDate", () => {
    it("accepts valid YYYY-MM-DD date", () => {
      expect(validateWorkDate("2026-03-15")).toBe("2026-03-15");
    });

    it("rejects invalid date formats", () => {
      expect(() => validateWorkDate("03/15/2026")).toThrow(ValidationError);
      expect(() => validateWorkDate("2026-13-40")).toThrow(ValidationError);
      expect(() => validateWorkDate(undefined)).toThrow(ValidationError);
    });
  });

  describe("validateTimesheetEntityType", () => {
    it("accepts task, issue, and subtask", () => {
      expect(validateTimesheetEntityType("task")).toBe("task");
      expect(validateTimesheetEntityType("issue")).toBe("issue");
      expect(validateTimesheetEntityType("subtask")).toBe("subtask");
    });

    it("rejects invalid entity types", () => {
      expect(() => validateTimesheetEntityType("comment")).toThrow(ValidationError);
    });
  });

  describe("validateFilename", () => {
    it("accepts valid filename", () => {
      expect(validateFilename("  report.pdf  ")).toBe("report.pdf");
    });

    it("rejects missing or overlong filename", () => {
      expect(() => validateFilename(undefined)).toThrow(ValidationError);
      expect(() => validateFilename("   ")).toThrow(ValidationError);
      expect(() => validateFilename("a".repeat(256))).toThrow(ValidationError);
    });
  });

  describe("validateCommentBody", () => {
    it("accepts comment text", () => {
      expect(validateCommentBody("Looks good")).toBe("Looks good");
    });

    it("rejects empty comment", () => {
      expect(() => validateCommentBody("")).toThrow(ValidationError);
    });
  });
});
