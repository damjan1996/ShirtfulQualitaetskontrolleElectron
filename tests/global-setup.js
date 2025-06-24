/**
 * Jest Global Setup
 * Wird einmal vor allen Tests ausgeführt
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
    console.log('🚀 Starting Jest Global Setup...');

    // Environment Setup
    process.env.NODE_ENV = 'test';
    process.env.TEST_MODE = 'true';
    process.env.MOCK_HARDWARE = 'true';
    process.env.TEST_DATABASE = 'true';
    process.env.FORCE_COLOR = '0'; // Disable colors in test output

    // Test-Verzeichnisse erstellen
    const testDirs = [
        'test-results',
        'coverage',
        'logs/test'
    ];

    for (const dir of testDirs) {
        const dirPath = path.join(process.cwd(), dir);
        try {
            await fs.mkdir(dirPath, { recursive: true });
            console.log(`📁 Created test directory: ${dir}`);
        } catch (error) {
            if (error.code !== 'EEXIST') {
                console.warn(`⚠️  Warning: Could not create directory ${dir}:`, error.message);
            }
        }
    }

    // Test-Konfigurationsdatei erstellen
    const testConfig = {
        testStartTime: new Date().toISOString(),
        testEnvironment: 'node',
        mockHardware: true,
        testDatabase: true,
        version: '1.0.0'
    };

    try {
        const configPath = path.join(process.cwd(), 'test-results', 'test-config.json');
        await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));
        console.log('📋 Created test configuration file');
    } catch (error) {
        console.warn('⚠️  Warning: Could not create test config file:', error.message);
    }

    // Mock Database Setup (falls notwendig)
    global.testDatabase = {
        isInitialized: true,
        mockData: {
            users: [
                { id: 1, name: 'Test User 1', epc: '53004114', active: true },
                { id: 2, name: 'Test User 2', epc: '53004115', active: true },
                { id: 3, name: 'Test User 3', epc: '53004116', active: true }
            ],
            sessions: [],
            qrScans: []
        }
    };

    // Global Test Utilities Setup
    global.testStartTime = Date.now();
    global.testEnvironmentReady = true;

    // Memory-Überwachung Setup
    const initialMemory = process.memoryUsage();
    global.testMemoryBaseline = initialMemory;

    console.log('📊 Initial memory usage:', {
        rss: `${Math.round(initialMemory.rss / 1024 / 1024)}MB`,
        heapUsed: `${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(initialMemory.heapTotal / 1024 / 1024)}MB`
    });

    // Cleanup previous test artifacts
    try {
        const coverageDir = path.join(process.cwd(), 'coverage');
        await fs.rmdir(coverageDir, { recursive: true });
        console.log('🧹 Cleaned previous coverage data');
    } catch (error) {
        // Ignore if directory doesn't exist
    }

    // Test-spezifische Console-Einstellungen
    const originalConsole = global.console;
    global.originalConsole = originalConsole;

    // Optionale Console-Unterdrückung für Tests
    if (process.env.JEST_SILENT === 'true') {
        global.console = {
            ...originalConsole,
            log: () => {},
            info: () => {},
            warn: () => {},
            debug: () => {}
            // error bleibt aktiv für wichtige Fehlermeldungen
        };
        console.log('🔇 Console output suppressed for tests');
    }

    // Electron-spezifische Setup
    if (!global.window) {
        global.window = {
            location: { href: 'http://localhost:3000' },
            navigator: { userAgent: 'test-agent' },
            document: { title: 'Test Environment' }
        };
    }

    // Hardware-Mock Verification
    console.log('🔧 Hardware mocks initialized');
    console.log('  - RFID Reader: Mock enabled');
    console.log('  - Camera: Mock enabled');
    console.log('  - Database: Mock enabled');

    // Performance Monitoring Setup
    global.testPerformanceMetrics = {
        setupTime: Date.now() - global.testStartTime,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        slowTests: []
    };

    console.log(`⚡ Global setup completed in ${global.testPerformanceMetrics.setupTime}ms`);
    console.log('✅ Test environment ready');
};