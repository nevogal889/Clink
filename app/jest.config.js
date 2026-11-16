/** @type {import('jest').Config} */
module.exports = {
  displayName: 'app',
  preset: 'jest-expo',
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}', '<rootDir>/app.config.test.ts'],
  // Mirrors the "@/*" path in tsconfig.json (Metro reads tsconfig paths itself).
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
