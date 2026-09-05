import { describe, expect, it, jest } from "@jest/globals";
import type { NextFunction, Request, Response } from "express";
import {
  requestContextMiddleware,
  securityHeadersMiddleware,
} from "../../../src/middleware/requestContext.js";

function mockReqRes(headers: Record<string, string | string[] | undefined> = {}) {
  const req = { headers } as Request;
  const res = {
    setHeader: jest.fn(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe("middleware/requestContext", () => {
  describe("requestContextMiddleware", () => {
    it("assigns requestId and userAgent and sets X-Request-Id header", () => {
      const { req, res, next } = mockReqRes({ "user-agent": "TestBrowser/1.0" });
      requestContextMiddleware(req, res, next);

      expect(req.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(req.userAgent).toBe("TestBrowser/1.0");
      expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", req.requestId as string);
      expect(next).toHaveBeenCalled();
    });

    it("truncates long user-agent strings to 512 chars", () => {
      const longAgent = "A".repeat(600);
      const { req, res, next } = mockReqRes({ "user-agent": longAgent });
      requestContextMiddleware(req, res, next);
      expect(req.userAgent).toHaveLength(512);
      expect(next).toHaveBeenCalled();
    });

    it("uses empty userAgent when header is absent or non-string", () => {
      const { req, res, next } = mockReqRes();
      requestContextMiddleware(req, res, next);
      expect(req.userAgent).toBe("");

      const { req: req2, res: res2, next: next2 } = mockReqRes({ "user-agent": ["a", "b"] });
      requestContextMiddleware(req2, res2, next2);
      expect(req2.userAgent).toBe("");
      expect(next2).toHaveBeenCalled();
    });
  });

  describe("securityHeadersMiddleware", () => {
    it("sets standard security headers", () => {
      const { req, res, next } = mockReqRes();
      securityHeadersMiddleware(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
      expect(res.setHeader).toHaveBeenCalledWith("Referrer-Policy", "strict-origin-when-cross-origin");
      expect(res.setHeader).toHaveBeenCalledWith("X-Frame-Options", "DENY");
      expect(res.setHeader).toHaveBeenCalledWith(
        "Permissions-Policy",
        "camera=(), microphone=(), geolocation=()",
      );
      expect(next).toHaveBeenCalled();
    });

    it("adds HSTS header in production", () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";
      const { req, res, next } = mockReqRes();
      securityHeadersMiddleware(req, res, next);
      expect(res.setHeader).toHaveBeenCalledWith(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains",
      );
      process.env.NODE_ENV = origEnv;
    });

    it("omits HSTS header outside production", () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "test";
      const { req, res, next } = mockReqRes();
      securityHeadersMiddleware(req, res, next);
      expect(res.setHeader).not.toHaveBeenCalledWith(
        "Strict-Transport-Security",
        expect.any(String),
      );
      process.env.NODE_ENV = origEnv;
    });
  });
});
