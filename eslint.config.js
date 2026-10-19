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
    // The SQLite migration, which is a one-shot tool for exactly one database
    // rather than a converter that has to survive whatever comes next.
    //
    // It is exempt from the type-safety rules below on purpose. They are the right
    // rules for application code that runs on every keystroke forever; a script
    // that reads a fixed schema, runs once, and whose every row is checked against
    // Zod on the way out gains nothing from asserting `data['jobs']!` is defined,
    // and loses the ability to read it. The rules that still apply are the ones
    // about actual mistakes: unused variables, undefined names, and so on.
    files: ['scripts/**/*.{ts,mjs}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
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
