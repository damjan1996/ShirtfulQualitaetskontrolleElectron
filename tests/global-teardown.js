/**
 * Jest Global Teardown
 * Wird einmal nach allen Tests ausgeführt
 */

const fs = require('fs').promises;
const path = require('path');

module.exports = async () => {
    console.log('🧹 Starting Jest Global Teardown...');

    const teardownStartTime = Date.now();
    const totalTestTime = teardownStartTime - (global.testStartTime || teardownStartTime);

    // Performance-Metrics sammeln
    const finalMemory = process.memoryUsage();
    const memoryDelta = {
        rss: finalMemory.rss - (global.testMemoryBaseline?.rss || 0),
        heapUsed: finalMemory.heapUsed - (global.testMemoryBaseline?.heapUsed || 0),
        heapTotal: finalMemory.heapTotal - (global.testMemoryBaseline?.heapTotal || 0)
    };

    // Test-Bericht erstellen
    const testReport = {
        summary: {
            totalRunTime: totalTestTime,
            setupTime: global.testPerformanceMetrics?.setupTime || 0,
            teardownTime: 0, // Wird am Ende gesetzt
            testEnvironment: 'node',
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch
        },
        performance: {
            initialMemory: global.testMemoryBaseline || {},
            finalMemory: finalMemory,
            memoryDelta: memoryDelta,
            slowTests: global.testPerformanceMetrics?.slowTests || []
        },
        environment: {
            nodeEnv: process.env.NODE_ENV,
            testMode: process.env.TEST_MODE,
            mockHardware: process.env.MOCK_HARDWARE,
            testDatabase: process.env.TEST_DATABASE
        },
        timestamp: {
            start: global.testStartTime ? new Date(global.testStartTime).toISOString() : null,
            end: new Date().toISOString()
        }
    };

    // Cleanup-Operationen
    try {
        // Mock-Cleanup
        if (global.mockElectron) {
            if (global.mockElectron.globalShortcut) {
                global.mockElectron.globalShortcut.unregisterAll();
                console.log('🧹 Cleared Electron global shortcuts');
            }

            if (global.mockElectron.ipcMain) {
                global.mockElectron.ipcMain.removeAllListeners();
                console.log('🧹 Cleared IPC main handlers');
            }
        }

        // Hardware-Mock-Cleanup
        if (global.mockHardware) {
            global.mockHardware.rfidReader.lastTag = null;
            global.mockHardware.rfidReader.onTag = null;
            global.mockHardware.camera.onQRCode = null;
            console.log('🧹 Cleared hardware mocks');
        }

        // Test-Database-Cleanup
        if (global.testDatabase) {
            global.testDatabase.mockData = {
                users: [],
                sessions: [],
                qrScans: []
            };
            console.log('🧹 Cleared test database');
        }

    } catch (error) {
        console.warn('⚠️  Warning during mock cleanup:', error.message);
    }

    // Console wiederherstellen
    if (global.originalConsole) {
        global.console = global.originalConsole;
        console.log('🔊 Console output restored');
    }

    // Memory-Analyse
    const memoryMB = {
        initial: {
            rss: Math.round((global.testMemoryBaseline?.rss || 0) / 1024 / 1024),
            heapUsed: Math.round((global.testMemoryBaseline?.heapUsed || 0) / 1024 / 1024),
            heapTotal: Math.round((global.testMemoryBaseline?.heapTotal || 0) / 1024 / 1024)
        },
        final: {
            rss: Math.round(finalMemory.rss / 1024 / 1024),
            heapUsed: Math.round(finalMemory.heapUsed / 1024 / 1024),
            heapTotal: Math.round(finalMemory.heapTotal / 1024 / 1024)
        },
        delta: {
            rss: Math.round(memoryDelta.rss / 1024 / 1024),
            heapUsed: Math.round(memoryDelta.heapUsed / 1024 / 1024),
            heapTotal: Math.round(memoryDelta.heapTotal / 1024 / 1024)
        }
    };

    console.log('📊 Memory Analysis:');
    console.log(`   Initial: RSS ${memoryMB.initial.rss}MB, Heap ${memoryMB.initial.heapUsed}MB/${memoryMB.initial.heapTotal}MB`);
    console.log(`   Final:   RSS ${memoryMB.final.rss}MB, Heap ${memoryMB.final.heapUsed}MB/${memoryMB.final.heapTotal}MB`);
    console.log(`   Delta:   RSS ${memoryDelta.rss >= 0 ? '+' : ''}${memoryMB.delta.rss}MB, Heap ${memoryDelta.heapUsed >= 0 ? '+' : ''}${memoryMB.delta.heapUsed}MB`);

    // Memory Leak Warnung
    const memoryLeakThreshold = 50 * 1024 * 1024; // 50MB
    if (memoryDelta.heapUsed > memoryLeakThreshold) {
        console.warn(`⚠️  Potential memory leak detected: Heap increased by ${memoryMB.delta.heapUsed}MB`);
    }

    // Test-Bericht speichern
    try {
        const teardownEndTime = Date.now();
        testReport.summary.teardownTime = teardownEndTime - teardownStartTime;

        const reportPath = path.join(process.cwd(), 'test-results', 'test-report.json');
        await fs.writeFile(reportPath, JSON.stringify(testReport, null, 2));
        console.log('📄 Test report saved to test-results/test-report.json');
    } catch (error) {
        console.warn('⚠️  Warning: Could not save test report:', error.message);
    }

    // Temporary test files cleanup
    try {
        const tempFiles = [
            'jest.config.temp.js',
            '.test-cache',
            'test-*.tmp'
        ];

        for (const filePattern of tempFiles) {
            const fullPath = path.join(process.cwd(), filePattern);
            try {
                await fs.unlink(fullPath);
            } catch (error) {
                // Ignore if file doesn't exist
            }
        }
        console.log('🧹 Cleaned temporary test files');
    } catch (error) {
        console.warn('⚠️  Warning during temp file cleanup:', error.message);
    }

    // Performance-Summary
    console.log('⏱️  Performance Summary:');
    console.log(`   Total test runtime: ${totalTestTime}ms`);
    console.log(`   Setup time: ${testReport.summary.setupTime}ms`);
    console.log(`   Teardown time: ${testReport.summary.teardownTime}ms`);

    if (global.testPerformanceMetrics?.slowTests?.length > 0) {
        console.log('🐌 Slow tests detected:');
        global.testPerformanceMetrics.slowTests.forEach(test => {
            console.log(`   - ${test.name}: ${test.duration}ms`);
        });
    }

    // Environment cleanup
    delete process.env.TEST_MODE;
    delete process.env.MOCK_HARDWARE;
    delete process.env.TEST_DATABASE;

    // Global cleanup
    delete global.testDatabase;
    delete global.testStartTime;
    delete global.testEnvironmentReady;
    delete global.testMemoryBaseline;
    delete global.testPerformanceMetrics;
    delete global.originalConsole;

    // Final garbage collection
    if (global.gc) {
        global.gc();
        console.log('🗑️  Manual garbage collection triggered');
    }

    console.log('✅ Global teardown completed');
    console.log('🎯 All tests finished, environment cleaned');
};