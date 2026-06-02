import base from '@repo/eslint-config/base';

export default [
  ...base,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
