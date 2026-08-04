import js from '@eslint/js'
import prettier from 'eslint-config-prettier/flat'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.pnpm-store/**',
      '**/.next/**',
      'apps/docs/public/r/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: {
          // `guard-release.mjs` is deliberately plain JS run by node directly
          // (see its own comment for why), so it isn't part of any
          // tsconfig's `include`. Without this it fails to parse at all.
          allowDefaultProject: ['scripts/*.mjs'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          // Allows dropping a key with `const {omitted: _omitted, ...rest} = x`.
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  // Must stay last so it can switch off rules that would fight the formatter.
  prettier,
)
