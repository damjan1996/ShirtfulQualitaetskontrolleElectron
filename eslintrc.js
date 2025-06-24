module.exports = {
    env: {
        browser: true,
        commonjs: true,
        es2022: true,
        node: true,
        jest: true
    },
    extends: [
        'eslint:recommended',
        'plugin:jest/recommended',
        'plugin:node/recommended',
        'prettier'
    ],
    plugins: [
        'jest',
        'node'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'commonjs'
    },
    rules: {
        // Console-Logging erlaubt (wichtig für Desktop-App)
        'no-console': 'off',

        // Unbenutzte Variablen (mit Ausnahme für Parameter mit _)
        'no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_'
            }
        ],

        // Prefer const über let wenn möglich
        'prefer-const': 'error',

        // Keine var verwenden
        'no-var': 'error',

        // Template Literals bevorzugen
        'prefer-template': 'warn',

        // Arrow Functions bevorzugen wo sinnvoll
        'prefer-arrow-callback': 'warn',

        // === statt ==
        'eqeqeq': ['error', 'always'],

        // Keine ungenutzten Ausdrücke
        'no-unused-expressions': 'error',

        // Keine undefined-Vergleiche
        'no-undefined': 'off',

        // Async/Await Rules
        'require-await': 'warn',
        'no-return-await': 'error',

        // Promise Rules
        'no-async-promise-executor': 'error',
        'prefer-promise-reject-errors': 'error',

        // Jest-spezifische Rules
        'jest/no-disabled-tests': 'warn',
        'jest/no-focused-tests': 'error',
        'jest/no-identical-title': 'error',
        'jest/prefer-to-have-length': 'warn',
        'jest/valid-expect': 'error',
        'jest/no-standalone-expect': 'error',
        'jest/no-test-prefixes': 'error',
        'jest/valid-describe-callback': 'error',
        'jest/valid-title': 'error',
        'jest/expect-expect': 'warn',
        'jest/no-duplicate-hooks': 'error',
        'jest/no-if': 'error',
        'jest/no-test-return-statement': 'error',
        'jest/prefer-strict-equal': 'warn',
        'jest/prefer-to-be': 'warn',
        'jest/prefer-to-contain': 'warn',

        // Node.js-spezifische Rules
        'node/no-unsupported-features/es-syntax': 'off',
        'node/no-missing-import': 'off',
        'node/no-missing-require': 'error',
        'node/no-unpublished-require': 'off',
        'node/no-unpublished-import': 'off',
        'node/exports-style': ['error', 'module.exports'],
        'node/file-extension-in-import': 'off',
        'node/prefer-global/buffer': ['error', 'always'],
        'node/prefer-global/console': ['error', 'always'],
        'node/prefer-global/process': ['error', 'always'],
        'node/prefer-global/url-search-params': ['error', 'always'],
        'node/prefer-global/url': ['error', 'always'],
        'node/prefer-promises/dns': 'error',
        'node/prefer-promises/fs': 'error',

        // Error Handling
        'no-throw-literal': 'error',
        'prefer-promise-reject-errors': 'error',

        // Best Practices
        'curly': ['error', 'all'],
        'dot-notation': 'error',
        'no-else-return': 'error',
        'no-implicit-coercion': 'error',
        'no-lonely-if': 'error',
        'no-unneeded-ternary': 'error',
        'object-shorthand': 'error',
        'one-var': ['error', 'never'],
        'operator-assignment': 'error',
        'prefer-object-spread': 'error',
        'spaced-comment': ['error', 'always'],

        // Security
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-script-url': 'error'
    },
    overrides: [
        // Test-Dateien: Weniger strenge Rules
        {
            files: [
                'tests/**/*.js',
                '**/*.test.js',
                '**/*.spec.js',
                '**/test/**/*.js',
                '**/tests/**/*.js'
            ],
            env: {
                jest: true
            },
            rules: {
                // Tests dürfen unpublished modules verwenden
                'node/no-unpublished-require': 'off',
                'node/no-unpublished-import': 'off',

                // Tests dürfen missing modules haben (Mocks)
                'node/no-missing-require': 'off',
                'node/no-missing-import': 'off',

                // Tests dürfen magic numbers haben
                'no-magic-numbers': 'off',

                // Tests dürfen längere Funktionen haben
                'max-lines-per-function': 'off',

                // Tests dürfen mehr Parameter haben
                'max-params': 'off',

                // Tests dürfen global Variablen setzen
                'no-global-assign': 'off',

                // Console.log in Tests ist OK für Debugging
                'no-console': 'off',

                // Tests können leere Funktionen haben (Mocks)
                'no-empty-function': 'off'
            }
        },

        // Mock-Dateien: Noch weniger strenge Rules
        {
            files: [
                'tests/mocks/**/*.js',
                '**/*.mock.js'
            ],
            rules: {
                // Mocks dürfen alles
                'node/no-unpublished-require': 'off',
                'node/no-missing-require': 'off',
                'no-unused-vars': 'off',
                'no-empty-function': 'off',
                'class-methods-use-this': 'off'
            }
        },

        // Setup/Config-Dateien
        {
            files: [
                '*.config.js',
                'setup.js',
                'scripts/**/*.js'
            ],
            rules: {
                'node/no-unpublished-require': 'off',
                'no-console': 'off'
            }
        },

        // Electron Main Process
        {
            files: [
                'main.js',
                'preload.js'
            ],
            env: {
                browser: false,
                node: true
            },
            globals: {
                __dirname: 'readonly',
                __filename: 'readonly'
            },
            rules: {
                'node/no-unsupported-features/es-syntax': 'off'
            }
        },

        // Renderer Process (Frontend)
        {
            files: [
                'renderer/**/*.js'
            ],
            env: {
                browser: true,
                node: false
            },
            globals: {
                electronAPI: 'readonly',
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly'
            },
            rules: {
                'node/no-unsupported-features/es-syntax': 'off',
                'node/no-unsupported-features/node-builtins': 'off'
            }
        }
    ],

    // Global Variables
    globals: {
        // Jest Globals
        describe: 'readonly',
        test: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',

        // Node.js Globals
        global: 'writable',
        process: 'readonly',
        Buffer: 'readonly',

        // Custom Test Globals
        testUtils: 'readonly',
        mockElectron: 'writable',
        mockHardware: 'writable',
        mockNodeModules: 'writable'
    },

    // Parser Options für moderne JS Features
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'commonjs',
        ecmaFeatures: {
            impliedStrict: true
        }
    },

    // Ignore Patterns
    ignorePatterns: [
        'node_modules/',
        'dist/',
        'build/',
        'coverage/',
        'test-results/',
        '*.min.js',
        'vendor/',
        'public/libs/'
    ]
};