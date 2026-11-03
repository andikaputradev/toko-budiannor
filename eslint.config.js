import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const restrictedProperties = [
  { property: 'innerHTML', message: 'Gunakan textContent atau createElementNS.' },
  { property: 'outerHTML', message: 'Gunakan API DOM untuk membuat elemen.' },
  { property: 'insertAdjacentHTML', message: 'Gunakan API DOM untuk membuat elemen.' },
  { object: 'document', property: 'write', message: 'document.write dilarang.' },
];

const safetyRules = {
  eqeqeq: ['error', 'always'],
  'no-eval': 'error',
  'no-new-func': 'error',
  'no-script-url': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  'no-console': ['error', { allow: ['warn', 'error'] }],
  'no-warning-comments': [
    'error',
    { terms: ['todo', 'fixme', 'xxx', 'hack'], location: 'anywhere' },
  ],
  'no-restricted-properties': ['error', ...restrictedProperties],
};

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'node_modules',
    'public',
    'export',
    'playwright-report',
    'test-results',
  ]),
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: safetyRules,
  },
  {
    files: ['tests/**/*.ts'],
    rules: { 'no-console': ['error', { allow: ['warn', 'error', 'info'] }] },
  },
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      ...safetyRules,
      'no-console': 'off',
      'no-undef': 'error',
      'no-unused-vars': 'error',
    },
  },
]);
