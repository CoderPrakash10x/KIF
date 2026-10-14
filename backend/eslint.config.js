const globals = require('globals');
module.exports = [
  { ignores: ['node_modules/**', 'coverage/**'] },
  { files: ['**/*.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node, ...globals.jest } },
    rules: { 'no-undef': 'error', 'no-redeclare': 'error', 'no-dupe-keys': 'error', 'no-unreachable': 'warn' } },
];
