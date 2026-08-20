import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      parserOptions: { sourceType: 'commonjs' },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      // El prefijo `_` marca lo intencionalmente descartado; `ignoreRestSiblings`
      // habilita el idioma `const { omitido: _x, ...resto } = obj`.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
);
