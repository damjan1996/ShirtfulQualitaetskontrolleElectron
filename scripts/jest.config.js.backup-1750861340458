// jest.config.js
module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
    moduleDirectories: ['node_modules', '<rootDir>'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1'
    },
    
    // WICHTIG: Babel komplett deaktivieren
    transform: {},
    
    testTimeout: 30000,
    verbose: false,
    clearMocks: true,
    reporters: ['default'],
    forceExit: true,
    detectOpenHandles: false,
    globals: {
        'process.env.NODE_ENV': 'test'
    }
};