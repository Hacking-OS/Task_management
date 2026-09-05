import { initDb } from "../../src/db.js";
import { resetRateLimitBucketsForTests } from "../../src/middleware/rateLimit.js";

let initialized = false;

beforeAll(() => {
  if (!initialized) {
    initDb({ seedDemo: false });
    initialized = true;
  }
});

beforeEach(() => {
  resetRateLimitBucketsForTests();
});
