/* global __dirname */
// Jest config for the widget end-to-end run against clink-dev (how to run: widget.e2e.test.ts). Not part of
// `npm test`: it signs in a test phone number on the real dev project and needs the network.
const path = require('node:path');

/** @type {import('jest').Config} */
module.exports = {
  rootDir: path.resolve(__dirname, '../..'),
  testEnvironment: 'node',
  // The app's own dependencies (supabase-js) live in the app workspace.
  modulePaths: ['<rootDir>/app/node_modules'],
  testMatch: ['<rootDir>/e2e/widget-api/**/*.e2e.test.ts'],
  transform: {
    '\\.[jt]sx?$': ['babel-jest', { configFile: path.join(__dirname, 'babel.config.js') }],
  },
  testTimeout: 120_000,
};
