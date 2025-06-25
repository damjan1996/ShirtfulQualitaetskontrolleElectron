// jest.config.js
module.exports = {
    testEnvironment: 'node',
    rootDir: '.',
    testMatch: [
        '**/tests/**/*.test.js',
        '**/__tests__/**/*.test.js'
    ],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/build/',
        '/.git/'
    ],
    moduleDirectories: ['node_modules', 'src'],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    collectCoverage: false,
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
    coverageReporters: ['text', 'lcov', 'html'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1'
    },
    transform: {},
    globals: {
        'process.env.NODE_ENV': 'test'
    },
    verbose: true,
    clearMocks: true,
    restoreMocks: true,
    resetMocks: true,
    testTimeout: 30000,
    forceExit: true,
    detectOpenHandles: false,
    maxWorkers: '50%'
};