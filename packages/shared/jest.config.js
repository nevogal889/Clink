/** @type {import('jest').Config} */
module.exports = {
  displayName: 'shared',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/fixtures'],
  testMatch: ['**/*.test.ts'],
  transform: { '^.+\\.ts$': 'babel-jest' },
};
