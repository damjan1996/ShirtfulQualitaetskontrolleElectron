module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es2021: true,
        node: true,
        jest: true
    },
    extends: [
        'eslint:recommended',
        'plugin:jest/recommended',
        'prettier'
    ],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    plugins: [
        'jest'
    ],
    rules: {
        // Erlaubt console statements (wichtig für Electron)
        'no-console': 'off',

        // Erlaubt unused vars mit Underscore prefix
        'no-unused-vars': ['error', {
            'argsIgnorePattern': '^_',
            'varsIgnorePattern': '^_'
        }],

        // Warnung statt Error für fehlende JSDoc
        'require-jsdoc': 'off',

        // Erlaubt async functions ohne await
        'require-await': 'off',

        // Node.js spezifisch
        'no-process-exit': 'off',

        // Jest spezifisch
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',

        // Electron spezifisch
        'no-undef': 'error',
        'no-restricted-globals': ['error', 'name', 'length'],

        // Best Practices
        'eqeqeq': ['error', 'always'],
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
        'arrow-spacing': 'error',
        'comma-dangle': ['error', 'never'],
        'quotes': ['error', 'single', { 'avoidEscape': true }],
        'semi': ['error', 'always']
    },
    overrides: [
        {
            // Test-Dateien
            files: ['**/*.test.js', '**/*.spec.js', '**/tests/**/*.js'],
            env: {
                jest: true
            },
            rules: {
                'no-unused-expressions': 'off',
                'jest/expect-expect': 'off',
                'jest/no-standalone-expect': 'off'
            }
        },
        {
            // Mock-Dateien
            files: ['**/mocks/**/*.js', '**/*.mock.js'],
            rules: {
                'no-unused-vars': 'off',
                'jest/no-mocks-import': 'off'
            }
        },
        {
            // Scripts
            files: ['scripts/**/*.js'],
            rules: {
                'no-console': 'off'
            }
        }
    ],
    ignorePatterns: [
        'node_modules/',
        'dist/',
        'build/',
        'coverage/',
        '*.min.js',
        'vendor/',
        '.git/',
        '*.config.js'
    ],
    globals: {
        // Electron globals
        'electronAPI': 'readonly',
        '__dirname': 'readonly',
        '__filename': 'readonly',
        'process': 'readonly',
        'Buffer': 'readonly',
        'global': 'readonly',

        // Test globals
        'mockElectron': 'writable',
        'testUtils': 'readonly'
    }
};