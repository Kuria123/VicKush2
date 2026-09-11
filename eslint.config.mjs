import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'coverage/**',
      'src/generated/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // eslint-plugin-react's automatic React version detection uses an API that
    // ESLint 10 removed. Pinning the version skips that code path entirely.
    settings: {
      react: { version: '19.2' },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // AutoMind architectural guard: the domain layer must stay pure and
    // framework-free so diagnostic logic is unit-testable in isolation.
    files: ['src/domain/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'next',
                'next/*',
                'react',
                'react-dom',
                '@/lib/db*',
                '@/generated/*',
              ],
              message:
                'src/domain must remain pure. Move I/O and framework code into src/services or src/lib.',
            },
          ],
        },
      ],
    },
  },
  prettier,
];

export default config;
