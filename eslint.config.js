import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'playwright-report/**', 'test-results/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 2022, sourceType: 'module' } },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ['src/sim/**/*.ts', 'src/core/**/*.ts', 'src/ai/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Sim code must use the seeded RNG.' },
        { object: 'Date', property: 'now', message: 'Sim code must not read wall-clock time.' },
        { object: 'performance', property: 'now', message: 'Sim code must not read wall-clock time.' }],
    },
  },
];
