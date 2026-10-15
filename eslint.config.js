import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    // `tmp` holds the legacy Flask app, kept as the migration source until Phase 8
    // completes. It is not this project's source and is not linted or formatted.
    ignores: ['dist', 'coverage', 'node_modules', '.tmp', 'tmp'],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: {
        // Type-aware linting. Scoped to TS files: the type-checked rules throw on
        // files that belong to no TS project.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // The constructs most likely to hide a defect in this codebase, so errors
      // rather than warnings.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'off',

      // `parseFloat` is the one builtin that silently produces a float, which is
      // the failure mode that rule exists to prevent. It has no place in a
      // document editor. `parseInt` returns an integer, so banning it is noise.
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message: 'Use Number() and round deliberately.',
        },
      ],
    },
  },
  {
    // Plain JS config files and the e2e smoke test run in Node and belong to no
    // TS project, so they get the non-type-checked baseline only.
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: globals.node,
    },
  },
)
