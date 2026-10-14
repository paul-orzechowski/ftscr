import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['tests/**/*.mjs'],
    rules: { '@typescript-eslint/no-unused-vars': 'error' },
  },
];
