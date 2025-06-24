// jest.config.js
/**
 * Jest Konfiguration für RFID QR Wareneingang Tests
 */

module.exports = {
    // Test Environment
    testEnvironment: 'node',

    // Setup-Dateien
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.js'],

    // Test-Dateien
    testMatch: [
        '<rootDir>/tests/**/*.test.js',
        '<rootDir>/tests/**/*.spec.js'
    ],

    // Ignore patterns - KORRIGIERT: testIgnore -> testPathIgnorePatterns
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/dist/',
        '<rootDir>/build/',
        '<rootDir>/release/'
    ],

    // Coverage
    collectCoverage: false,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html', 'json'],
    collectCoverageFrom: [
        'main.js',
        'preload.js',
        'renderer/**/*.js',
        'rfid/**/*.js',
        'db/**/*.js',
        'utils/**/*.js',
        '!renderer/libs/**',
        '!**/*.config.js',
        '!**/*.mock.js',
        '!tests/**'
    ],

    // Coverage Thresholds
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 75,
            lines: 80,
            statements: 80
        },
        './db/': {
            branches: 80,
            functions: 85,
            lines: 90,
            statements: 90
        },
        './rfid/': {
            branches: 75,
            functions: 80,
            lines: 85,
            statements: 85
        }
    },

    // KORRIGIERT: moduleNameMapping -> moduleNameMapper
    moduleNameMapper: {
        '^electron$': '<rootDir>/tests/mocks/electron.mock.js',
        '^mssql$': '<rootDir>/tests/mocks/mssql.mock.js',
        '^node-hid$': '<rootDir>/tests/mocks/node-hid.mock.js'
    },

    // Transform-Konfiguration
    transform: {
        '^.+\\.jsx?$': 'babel-jest'
    },

    // KORRIGIERT: setupTimeout entfernt (kein gültiger Jest-Parameter)
    // Test-Timeouts
    testTimeout: 30000,

    // Verbose Output
    verbose: true,

    // Clear Mocks zwischen Tests
    clearMocks: true,
    restoreMocks: true,

    // Fake Timers
    fakeTimers: {
        enableGlobally: false
    },

    // Error-Handling
    errorOnDeprecated: true,

    // Max Workers für parallele Tests
    maxWorkers: '50%',

    // Bail-Konfiguration (stoppe bei ersten Fehlern)
    bail: false,

    // Test-Sequencer für deterministische Reihenfolge
    testSequencer: '<rootDir>/tests/setup/test-sequencer.js',

    // Reporter
    reporters: [
        'default',
        ['jest-html-reporters', {
            publicPath: './coverage',
            filename: 'test-report.html',
            expand: true
        }]
    ],

    // Global Test-Variables
    globals: {
        'NODE_ENV': 'test',
        'MSSQL_SERVER': 'localhost',
        'MSSQL_DATABASE': 'RdScanner_Test',
        'MSSQL_USER': 'test_user',
        'MSSQL_PASSWORD': 'test_password'
    },

    // Watch-Konfiguration
    watchman: true,
    watchPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/dist/',
        '<rootDir>/coverage/'
    ]
};