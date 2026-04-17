// Type-checked version of jest config for IDE support.
// The active config consumed by Jest is jest.config.js.
// This file is kept for reference only.
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};

export default config;
