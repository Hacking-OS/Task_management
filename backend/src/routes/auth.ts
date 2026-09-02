import { Router } from "express";
import * as authService from "../services/auth.js";
import { ValidationError } from "../validation/errors.js";
import {
  validateEmail,
  validateLoginIdentifier,
  validatePassword,
  validateUsername,
} from "../validation/common.js";

const router = Router();

function handleAuthError(res: import("express").Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Request failed";
  const status = error instanceof ValidationError ? 400 : message.includes("Invalid") ? 401 : 400;
  res.status(status).json({ error: message });
}

router.post("/register", (req, res) => {
  try {
    const username = validateUsername(req.body.username);
    const email = validateEmail(req.body.email);
    const password = validatePassword(req.body.password);
    const result = authService.register(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    handleAuthError(res, error);
  }
});

router.post("/login", (req, res) => {
  try {
    const identifier = validateLoginIdentifier(req.body.username ?? req.body.identifier ?? req.body.email);
    const password = req.body.password;
    if (typeof password !== "string" || !password) {
      res.status(400).json({ error: "Password is required" });
      return;
    }
    const result = authService.login(identifier, password);
    res.json(result);
  } catch (error) {
    handleAuthError(res, error);
  }
});

export default router;
