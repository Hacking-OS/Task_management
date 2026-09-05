import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import {
  authMiddleware,
  getJwtSecret,
  signAccessToken,
  signToken,
  verifyToken,
} from "../../../src/middleware/auth.js";
import { createAuthenticatedSession, revokeSession } from "../../../src/services/sessions.js";
import { createTestUser } from "../../setup/fixtures.js";

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    method: "GET",
    path: "/test",
    ip: "127.0.0.1",
    requestId: "req-test",
    userAgent: "jest-agent",
    ...overrides,
  } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    headersSent: false,
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("middleware/auth", () => {
  describe("getJwtSecret", () => {
    it("returns configured secret in test environment", () => {
      expect(getJwtSecret()).toBe(process.env.JWT_SECRET);
    });

    it("throws in production when default secret is used", async () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.JWT_SECRET;
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = "production";
      jest.resetModules();

      const { getJwtSecret: getSecret } = await import("../../../src/middleware/auth.js");
      expect(() => getSecret()).toThrow("JWT_SECRET must be set in production");

      process.env.NODE_ENV = origEnv;
      if (origSecret !== undefined) process.env.JWT_SECRET = origSecret;
      jest.resetModules();
    });
  });

  describe("verifyToken", () => {
    it("returns payload for valid token", () => {
      const user = createTestUser("auth_verify");
      const { session } = createAuthenticatedSession(user.id);
      const { accessToken } = signAccessToken(user.id, session.id);
      const payload = verifyToken(accessToken);
      expect(payload).toEqual(expect.objectContaining({ sub: user.id, sid: session.id }));
    });

    it("returns null for invalid token", () => {
      expect(verifyToken("not-a-token")).toBeNull();
    });

    it("returns null when sub is missing", () => {
      const token = jwt.sign({}, getJwtSecret(), { expiresIn: 60 });
      expect(verifyToken(token)).toBeNull();
    });
  });

  describe("signAccessToken", () => {
    it("returns signed token and expiry", () => {
      const user = createTestUser("auth_sign");
      const sessionId = "session-123";
      const result = signAccessToken(user.id, sessionId);
      expect(result.accessToken).toBeDefined();
      expect(result.expiresIn).toBeGreaterThan(0);
      expect(verifyToken(result.accessToken)).toEqual(
        expect.objectContaining({ sub: user.id, sid: sessionId }),
      );
    });
  });

  describe("signToken (deprecated)", () => {
    it("signs token without session id when omitted", () => {
      const user = createTestUser("auth_legacy");
      const token = signToken(user.id);
      expect(verifyToken(token)).toEqual(expect.objectContaining({ sub: user.id }));
      expect(verifyToken(token)?.sid).toBeUndefined();
    });

    it("delegates to signAccessToken when session id provided", () => {
      const user = createTestUser("auth_legacy_sid");
      const token = signToken(user.id, "sid-abc");
      expect(verifyToken(token)).toEqual(expect.objectContaining({ sub: user.id, sid: "sid-abc" }));
    });
  });

  describe("authMiddleware", () => {
    it("returns 401 when bearer token is missing", () => {
      const { req, res, next } = mockReqRes();
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Authentication required" }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 for invalid token", () => {
      const { req, res, next } = mockReqRes({
        headers: { authorization: "Bearer invalid-token" },
      });
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Invalid or expired token" }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when token has no session id", () => {
      const user = createTestUser("auth_no_sid");
      const token = jwt.sign({ sub: user.id }, getJwtSecret(), { expiresIn: 60 });
      const { req, res, next } = mockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Session required. Please sign in again." }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when session is revoked", () => {
      const user = createTestUser("auth_revoked");
      const { session } = createAuthenticatedSession(user.id);
      const { accessToken } = signAccessToken(user.id, session.id);
      revokeSession(session.id, user.id);

      const { req, res, next } = mockReqRes({
        headers: { authorization: `Bearer ${accessToken}` },
      });
      authMiddleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Session expired or revoked" }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next and attaches user on valid session", () => {
      const user = createTestUser("auth_success");
      const { session } = createAuthenticatedSession(user.id);
      const { accessToken } = signAccessToken(user.id, session.id);

      const { req, res, next } = mockReqRes({
        headers: { authorization: `Bearer ${accessToken}` },
      });
      authMiddleware(req, res, next);

      expect(req.userId).toBe(user.id);
      expect(req.sessionId).toBe(session.id);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
