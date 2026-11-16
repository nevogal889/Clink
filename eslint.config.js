// Shared ESLint config for every workspace (flat config).
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

// Props that reach the user (screen readers included). Their values must come from the
// COPY.md string table, never a literal (CLAUDE.md "Coding conventions").
const USER_FACING_PROPS = [
  'accessibilityLabel',
  'accessibilityHint',
  'aria-label',
  'alt',
  'label',
  'placeholder',
  'title',
];

module.exports = defineConfig([
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      'app/ios/**',
      'app/android/**',
      'supabase/functions/**',
      'prototype.html',
    ],
  },
  expoConfig,
  prettierConfig,
  {
    // Lint runs from the repo root, so point the import resolver at each workspace's tsconfig.
    settings: {
      'import/resolver': {
        typescript: { project: ['app/tsconfig.json', 'packages/shared/tsconfig.json'] },
      },
    },
  },
  {
    files: ['app/src/**/*.tsx'],
    ignores: ['**/*.test.tsx'],
    rules: {
      'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }],
      'no-restricted-syntax': [
        'error',
        {
          selector: `JSXAttribute[name.name=/^(${USER_FACING_PROPS.join('|')})$/] > Literal`,
          message: 'User-facing text comes from the COPY.md string table, not a literal.',
        },
        {
          selector: `JSXAttribute[name.name=/^(${USER_FACING_PROPS.join('|')})$/] > JSXExpressionContainer > Literal`,
          message: 'User-facing text comes from the COPY.md string table, not a literal.',
        },
      ],
    },
  },
]);
