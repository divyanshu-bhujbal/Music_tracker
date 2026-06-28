import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/index.ts"],
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 70,
      lines: 80,
      statements: 80,
    },
  },
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html"],
  moduleNameMapper: {
    "^@collectio/shared$": "<rootDir>/src",
    "^(\\.\\.?\\/.*)\\.js$": "$1",
  },
  moduleFileExtensions: ["ts", "js", "json"],
};

export default config;
