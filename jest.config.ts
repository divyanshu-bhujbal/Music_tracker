import type { Config } from 'jest';

const config: Config = {
  projects: [
    '<rootDir>/packages/shared',
    '<rootDir>/packages/platform',
    '<rootDir>/packages/renderer',
  ],
};

export default config;
