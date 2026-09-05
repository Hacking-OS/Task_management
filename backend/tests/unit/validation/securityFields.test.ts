import { validateEmail, validatePassword, validateUsername } from "../../../src/validation/common.js";
import { ValidationError } from "../../../src/validation/errors.js";

/**
 * Hand-rolled validators reject invalid input but do not strip unknown fields.
 * Routes must only pass whitelisted fields to services — these tests document
 * that privilege fields in payloads do not bypass validation when absent from service calls.
 */
describe("security field handling in validators", () => {
  const privilegePayloads = [
    { isAdmin: true },
    { isOwner: true },
    { role: "OWNER" },
    { permissions: ["*"] },
    { securityVersion: 999 },
    { approvedBy: "attacker" },
    { approvalStatus: "APPROVED" },
  ];

  it.each(privilegePayloads)("validateUsername rejects object with %p", (extra) => {
    expect(() => validateUsername({ username: "validuser", ...extra })).toThrow(ValidationError);
  });

  it.each(privilegePayloads)("validateEmail rejects object with %p", (extra) => {
    expect(() => validateEmail({ email: "a@test.com", ...extra })).toThrow(ValidationError);
  });

  it("validatePassword rejects privilege object", () => {
    expect(() => validatePassword({ password: "ValidPass1", isAdmin: true })).toThrow(ValidationError);
  });

  it("validators never accept boolean coerced as string username", () => {
    expect(() => validateUsername(true)).toThrow(ValidationError);
    expect(() => validateUsername(123)).toThrow(ValidationError);
  });
});
