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
    "^(\\.\\.?\\/.*)\\.js$": "$1",
    "\\?raw$": "<rootDir>/src/__mocks__/rawMock.ts",
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
      branches: 30,
      functions: 30,
      lines: 30,
      statements: 30,
    },
  },
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
};

export default config;
