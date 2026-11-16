// One Jest run for every workspace. Each project keeps its own config next to its code.
/** @type {import('jest').Config} */
module.exports = {
  projects: ['<rootDir>/packages/shared', '<rootDir>/app'],
};
