module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '<rootDir>/tests/**/*.test.js'
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/dist/',
        '<rootDir>/build/'
    ],
    transform: {},
    clearMocks: true,
    testTimeout: 10000,
    collectCoverage: false
};