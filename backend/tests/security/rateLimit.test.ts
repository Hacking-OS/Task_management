import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import {
  approvalRateLimit,
  checkRateLimit,
  ipUserScopeRateLimitForTests,
  loginRateLimit,
  noLogRateLimitForTests,
  resetRateLimitBucketsForTests,
} from "../../src/middleware/rateLimit.js";

function mockReqRes(overrides: Partial<Request> = {}) {
  const req = {
    headers: {},
    method: "POST",
    path: "/api/auth/login",
    ip: "10.0.0.1",
    requestId: "rate-test",
    ...overrides,
  } as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("rate limiting", () => {
  beforeEach(() => {
    resetRateLimitBucketsForTests();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("allows requests below threshold", () => {
    const key = "test:below";
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 5, 60_000).allowed).toBe(true);
  });

  it("blocks at threshold", () => {
    const key = "test:at";
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("resets after window expires", () => {
    const key = "test:window";
    const realNow = Date.now;
    Date.now = () => 1_000_000;
    checkRateLimit(key, 1, 1000);
    expect(checkRateLimit(key, 1, 1000).allowed).toBe(false);
    Date.now = () => 1_002_000;
    expect(checkRateLimit(key, 1, 1000).allowed).toBe(true);
    Date.now = realNow;
  });

  describe("loginRateLimit middleware", () => {
    it("blocks after max requests from same ip", () => {
      for (let i = 0; i < 20; i++) {
        const { req, res, next } = mockReqRes({ ip: "192.168.1.10" });
        loginRateLimit(req, res, next);
        expect(next).toHaveBeenCalled();
        next.mockClear();
      }

      const { req, res, next } = mockReqRes({ ip: "192.168.1.10" });
      loginRateLimit(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: "Too many requests. Please try again later." }),
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("DISABLE_RATE_LIMIT bypass", () => {
    it("skips rate limiting when env flag is set", () => {
      process.env.DISABLE_RATE_LIMIT = "1";
      for (let i = 0; i < 25; i++) {
        const { req, res, next } = mockReqRes({ ip: "192.168.1.99" });
        loginRateLimit(req, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });
  });

  describe("scope-specific keys via middleware", () => {
    it("scopes approvalRateLimit by user id", () => {
      for (let i = 0; i < 60; i++) {
        const { req, res, next } = mockReqRes({ userId: "user-a", ip: "1.1.1.1" });
        approvalRateLimit(req, res, next);
        expect(next).toHaveBeenCalled();
        next.mockClear();
      }

      const blocked = mockReqRes({ userId: "user-a", ip: "1.1.1.1" });
      approvalRateLimit(blocked.req, blocked.res, blocked.next);
      expect(blocked.res.status).toHaveBeenCalledWith(429);

      const otherUser = mockReqRes({ userId: "user-b", ip: "1.1.1.1" });
      approvalRateLimit(otherUser.req, otherUser.res, otherUser.next);
      expect(otherUser.next).toHaveBeenCalled();
    });

    it("scopes loginRateLimit by ip regardless of user", () => {
      for (let i = 0; i < 20; i++) {
        const { req, res, next } = mockReqRes({ userId: `user-${i}`, ip: "2.2.2.2" });
        loginRateLimit(req, res, next);
        expect(next).toHaveBeenCalled();
        next.mockClear();
      }

      const blocked = mockReqRes({ userId: "new-user", ip: "2.2.2.2" });
      loginRateLimit(blocked.req, blocked.res, blocked.next);
      expect(blocked.res.status).toHaveBeenCalledWith(429);

      const otherIp = mockReqRes({ userId: "new-user", ip: "2.2.2.3" });
      loginRateLimit(otherIp.req, otherIp.res, otherIp.next);
      expect(otherIp.next).toHaveBeenCalled();
    });

    it("scopes default ip_user limiter by user and ip pair", () => {
      const first = mockReqRes({ userId: "user-x", ip: "3.3.3.3" });
      ipUserScopeRateLimitForTests(first.req, first.res, first.next);
      expect(first.next).toHaveBeenCalled();

      const second = mockReqRes({ userId: "user-x", ip: "3.3.3.3" });
      ipUserScopeRateLimitForTests(second.req, second.res, second.next);
      expect(second.next).toHaveBeenCalled();

      const blocked = mockReqRes({ userId: "user-x", ip: "3.3.3.3" });
      ipUserScopeRateLimitForTests(blocked.req, blocked.res, blocked.next);
      expect(blocked.res.status).toHaveBeenCalledWith(429);

      const otherIp = mockReqRes({ userId: "user-x", ip: "3.3.3.4" });
      ipUserScopeRateLimitForTests(otherIp.req, otherIp.res, otherIp.next);
      expect(otherIp.next).toHaveBeenCalled();
    });

    it("uses unknown ip when req.ip is missing", () => {
      const { req, res, next } = mockReqRes({ ip: undefined });
      loginRateLimit(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it("blocks without logging when logAction is omitted", () => {
      const allowed = mockReqRes({ ip: "9.9.9.9" });
      noLogRateLimitForTests(allowed.req, allowed.res, allowed.next);
      expect(allowed.next).toHaveBeenCalled();

      const blocked = mockReqRes({ ip: "9.9.9.9" });
      noLogRateLimitForTests(blocked.req, blocked.res, blocked.next);
      expect(blocked.res.status).toHaveBeenCalledWith(429);
      expect(blocked.next).not.toHaveBeenCalled();
    });
  });
});
