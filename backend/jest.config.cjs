/** @type {import('jest').Config} */
const coverageThreshold = require("./coverage-thresholds.cjs");

module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  maxWorkers: 1,
  moduleNameMapper: {
    "^\\.\\./\\.\\./src/(.*)\\.js$": "<rootDir>/src/$1",
    "^\\.\\./\\.\\./\\.\\./src/(.*)\\.js$": "<rootDir>/src/$1",
    "^\\./version\\.js$": "<rootDir>/tests/setup/version.mock.ts",
    "^\\.\\./version\\.js$": "<rootDir>/tests/setup/version.mock.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.test.json",
        diagnostics: { ignoreCodes: [151002, 1343] },
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts"],
  setupFiles: ["<rootDir>/tests/setup/env.cjs"],
  setupFilesAfterEnv: ["<rootDir>/tests/setup/jest.setup.ts"],
  collectCoverageFrom: [
    "src/services/**/*.ts",
    "src/middleware/**/*.ts",
    "src/validation/**/*.ts",
    "src/permissions/**/*.ts",
    "src/routes/**/*.ts",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "json-summary"],
  coverageThreshold,
  reporters: ["default"],
  testTimeout: 30000,
};
