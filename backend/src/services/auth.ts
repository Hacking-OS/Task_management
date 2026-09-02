import bcrypt from "bcryptjs";
import { db } from "../db.js";
import { signToken } from "../middleware/auth.js";
import { ActivityLogger } from "./activityLogger.js";
import { notify } from "./notifications.js";
import { avatarUrlForUser } from "./files.js";
import { validateEmail, validateLoginIdentifier, validatePassword, validateUsername } from "../validation/common.js";
import type { User } from "../types.js";

function mapUser(row: { id: string; username: string; email: string; created_at: string }): User {
  return {
    ...row,
    avatar_url: avatarUrlForUser(row.id),
  };
}

export function register(username: string, email: string, password: string): { user: User; token: string } {
  const validUsername = validateUsername(username);
  const validEmail = validateEmail(email);
  const validPassword = validatePassword(password);

  const existing = db
    .prepare("SELECT id FROM users WHERE username = ? OR email = ?")
    .get(validUsername, validEmail);
  if (existing) throw new Error("Username or email already exists");

  const id = crypto.randomUUID();
  const hash = bcrypt.hashSync(validPassword, 10);
  db.prepare(
    "INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)"
  ).run(id, validUsername, validEmail, hash);

  const user = mapUser(db.prepare("SELECT id, username, email, created_at FROM users WHERE id = ?").get(id) as User);
  ActivityLogger.log({
    userId: id,
    entityType: "user",
    entityId: id,
    action: "registered",
    description: `Account created for ${validUsername}`,
  });
  notify({ userId: id, type: "success", title: "Welcome!", message: `Account created for ${validUsername}.`, entityType: "user", entityId: id });
  return { user, token: signToken(id) };
}

export function login(identifier: string, password: string): { user: User; token: string } {
  const validIdentifier = validateLoginIdentifier(identifier);
  assertPasswordProvided(password);

  const row = db
    .prepare(`
      SELECT id, username, email, password_hash, created_at FROM users
      WHERE username = ? OR email = ?
    `)
    .get(validIdentifier, validIdentifier.toLowerCase()) as (User & { password_hash: string }) | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    throw new Error("Invalid username or password");
  }

  const user = mapUser(row);
  ActivityLogger.log({
    userId: row.id,
    entityType: "user",
    entityId: row.id,
    action: "login",
    description: `${row.username} signed in`,
  });
  notify({
    userId: row.id,
    type: "login",
    title: "Login successful",
    message: `Welcome back, ${row.username}!`,
    entityType: "user",
    entityId: row.id,
  });
  return { user, token: signToken(row.id) };
}

function assertPasswordProvided(password: unknown): void {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required");
  }
}

export function getUser(userId: string): User | undefined {
  const row = db
    .prepare("SELECT id, username, email, created_at FROM users WHERE id = ?")
    .get(userId) as User | undefined;
  return row ? mapUser(row) : undefined;
}
