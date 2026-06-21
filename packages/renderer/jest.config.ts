import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jest-environment-jsdom",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
  setupFilesAfterEnv: ["./src/test-setup.ts"],
  moduleNameMapper: {
    "^@shared$": "<rootDir>/../shared/src",
    "^@shared/(.*)$": "<rootDir>/../shared/src/$1",
    "^@platform$": "<rootDir>/../platform/src",
    "^@platform/(.*)$": "<rootDir>/../platform/src/$1",
    "\\.(css|less|scss|svg|png|jpg|gif)$":
      "<rootDir>/src/__mocks__/fileMock.ts",
  },
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/main.tsx",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};

export default config;
