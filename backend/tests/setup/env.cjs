const path = require("path");
const fs = require("fs");

const testDir = path.join(__dirname, "..", "..", "data", "test");
fs.mkdirSync(testDir, { recursive: true });

process.env.TEST_DB_PATH = ":memory:";
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "jest-test-jwt-secret-min-32-chars-long";
