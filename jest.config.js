// jest.config.js
module.exports = {
    // Test-Umgebung
    testEnvironment: 'node',

    // Root-Verzeichnis
    rootDir: '.',

    // Test-Dateien Pattern
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.test.js'
    ],

    // Ignorierte Pfade
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/build/',
        '/.git/'
    ],

    // Module Pfade
    moduleDirectories: ['node_modules', 'src'],

    // Setup-Dateien
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

    // Coverage Konfiguration
    collectCoverage: false, // Nur bei Bedarf aktivieren
    collectCoverageFrom: [
        '**/*.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/coverage/**',
        '!**/dist/**',
        '!jest.config.js',
        '!.eslintrc.js'
    ],

    coverageDirectory: 'coverage',

    coverageReporters: [
        'text',
        'lcov',
        'html',
        'json'
    ],

    // Coverage Schwellenwerte
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    },

    // Modul-Aliase
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1',
        '^electron$': '<rootDir>/tests/mocks/electron.mock.js'
    },

    // Transform-Optionen
    transform: {
        '^.+\\.js$': ['babel-jest', {
            presets: [
                ['@babel/preset-env', {
                    targets: {
                        node: 'current'
                    }
                }]
            ]
        }]
    },

    // Globale Variablen
    globals: {
        'process.env.NODE_ENV': 'test'
    },

    // Weitere Optionen
    verbose: true,
    bail: false,
    clearMocks: true,
    restoreMocks: true,
    resetMocks: true,
    resetModules: false,

    // Timeouts
    testTimeout: 30000,

    // Fehlerbehandlung
    errorOnDeprecated: false,

    // Force Exit nach Tests
    forceExit: true,

    // Open Handles Detection
    detectOpenHandles: false,

    // Maximale Worker
    maxWorkers: process.env.CI ? 2 : '50%',

    // Silent Mode im CI
    silent: process.env.CI === 'true'
};