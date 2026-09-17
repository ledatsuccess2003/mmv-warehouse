import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Only the two long-standing hooks rules — eslint-plugin-react-hooks v7's
      // "recommended" preset also pulls in React Compiler-era rules (e.g.
      // set-state-in-effect) that flag common, legitimate patterns like
      // `useEffect(() => { load() }, [...])` used throughout this codebase.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Warn, not error — the existing Supabase API layer (src/lib/api.ts)
      // uses `any` pragmatically in several places; downgraded so lint
      // reports it as signal without failing on pre-existing code.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
)
