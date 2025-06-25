// jest.config.js
/**
 * Jest Configuration - Ohne Babel für Node.js Tests
 * Einfache Konfiguration für JavaScript ohne Transformation
 */

module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testMatch: [
        '<rootDir>/tests/**/*.test.js',
        '<rootDir>/tests/**/*.spec.js'
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/build/',
        '/.git/'
    ],
    moduleDirectories: ['node_modules', '<rootDir>'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1'
    },

    // WICHTIG: Babel-Transformation deaktivieren
    transform: {},

    // Coverage (optional)
    collectCoverage: false,
    collectCoverageFrom: [
        'db/**/*.js',
        'rfid/**/*.js',
        'main.js',
        'preload.js',
        '!**/node_modules/**',
        '!**/tests/**',
        '!**/coverage/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],

    // Timeouts und Performance
    testTimeout: 30000,
    maxWorkers: '50%',

    // Output
    verbose: false,
    silent: false,

    // Error handling
    errorOnDeprecated: false,
    bail: 0,

    // Mock configuration
    clearMocks: true,
    resetMocks: false,
    restoreMocks: true,

    // Globals
    globals: {
        'process.env.NODE_ENV': 'test'
    },

    // Reports
    reporters: ['default'],

    // Clean up
    detectOpenHandles: false,
    forceExit: true,

    // Ignore patterns
    modulePathIgnorePatterns: [
        '<rootDir>/dist/',
        '<rootDir>/build/',
        '<rootDir>/node_modules/.cache/'
    ]
};