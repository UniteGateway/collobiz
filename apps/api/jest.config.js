const fs = require('fs');
const swcrc = JSON.parse(fs.readFileSync(`${__dirname}/.swcrc`, 'utf8'));
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/src'],
  testMatch: ['**/*.test.ts', '**/*.e2e.ts'],
  transform: { '^.+\\.ts$': ['@swc/jest', { ...swcrc, swcrc: false }] },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,
};
