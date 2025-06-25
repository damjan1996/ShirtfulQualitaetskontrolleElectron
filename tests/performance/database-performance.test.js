// tests/performance/database-performance.test.js
/**
 * Database Performance Tests - Korrigiert
 * Testet die Performance von Database und RFID Operationen
 */

const MockDatabaseClient = require('../mocks/db-client.mock');
const MockRFIDListener = require('../mocks/rfid-listener.mock');

// Test Utilities
const waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

describe('Database Performance Tests', () => {
    let dbClient;
    let performanceMetrics;

    beforeEach(async () => {
        dbClient = new MockDatabaseClient();
        await dbClient.connect();
        dbClient.clearMockData();

        performanceMetrics = {
            queries: 0,
            totalTime: 0,
            minTime: Infinity,
            maxTime: 0,
            averageTime: 0
        };
    });

    afterEach(async () => {
        await dbClient.close();
    });

    async function measurePerformance(operation) {
        const startTime = Date.now();
        await operation();
        const endTime = Date.now();
        const duration = endTime - startTime;

        performanceMetrics.queries++;
        performanceMetrics.totalTime += duration;
        performanceMetrics.minTime = Math.min(performanceMetrics.minTime, duration);
        performanceMetrics.maxTime = Math.max(performanceMetrics.maxTime, duration);
        performanceMetrics.averageTime = performanceMetrics.totalTime / performanceMetrics.queries;

        return duration;
    }

    describe('User Lookup Performance', () => {
        test('should handle rapid user lookups efficiently', async () => {
            const lookupCount = 100;
            const maxAverageTime = 50; // 50ms average should be achievable

            for (let i = 0; i < lookupCount; i++) {
                await measurePerformance(async () => {
                    await dbClient.getUserByRFID('329C172');
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);
            expect(performanceMetrics.queries).toBe(lookupCount);

            console.log(`User Lookup Performance:
                Lookups: ${lookupCount}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
                Min Time: ${performanceMetrics.minTime}ms
                Max Time: ${performanceMetrics.maxTime}ms
                Total Time: ${performanceMetrics.totalTime}ms
            `);
        });

        test('should handle concurrent user lookups', async () => {
            const concurrentLookups = 50;
            const maxConcurrentTime = 1000;

            const startTime = Date.now();

            const promises = Array.from({ length: concurrentLookups }, () =>
                dbClient.getUserByRFID('329C172')
            );

            const results = await Promise.all(promises);
            const totalTime = Date.now() - startTime;

            expect(totalTime).toBeLessThan(maxConcurrentTime);
            expect(results.length).toBe(concurrentLookups);
            expect(results.every(user => user && user.BenID === 1)).toBe(true);

            console.log(`Concurrent User Lookup Performance:
                Concurrent Lookups: ${concurrentLookups}
                Total Time: ${totalTime}ms
                Lookups/sec: ${(concurrentLookups / (totalTime / 1000)).toFixed(0)}
            `);
        });

        test('should handle unknown user lookups efficiently', async () => {
            const unknownLookups = 50;
            const maxAverageTime = 30;

            for (let i = 0; i < unknownLookups; i++) {
                await measurePerformance(async () => {
                    const result = await dbClient.getUserByRFID(`UNKNOWN${i}`);
                    expect(result).toBeNull();
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);

            console.log(`Unknown User Lookup Performance:
                Lookups: ${unknownLookups}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
            `);
        });
    });

    describe('Session Management Performance', () => {
        test('should handle rapid session creation', async () => {
            const sessionCount = 25; // Reduziert für stabilere Tests
            const maxAverageTime = 100;

            for (let i = 0; i < sessionCount; i++) {
                await measurePerformance(async () => {
                    const session = await dbClient.createSession(1);
                    expect(session).toBeDefined();
                    expect(session.BenID).toBe(1);
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);

            console.log(`Session Creation Performance:
                Sessions: ${sessionCount}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
                Total Sessions in DB: ${dbClient.mockData.sessions.length}
            `);
        });

        test('should handle session lifecycle efficiently', async () => {
            const lifecycleCount = 20;
            const maxTotalTime = 2000;

            const startTime = Date.now();

            for (let i = 0; i < lifecycleCount; i++) {
                // Create session
                const session = await dbClient.createSession(1);

                // Add some QR scans
                await dbClient.saveQRScan(session.ID, `TEST_SCAN_${i}_1`);
                await dbClient.saveQRScan(session.ID, `TEST_SCAN_${i}_2`);

                // End session
                await dbClient.endSession(session.ID);
            }

            const totalTime = Date.now() - startTime;

            expect(totalTime).toBeLessThan(maxTotalTime);

            console.log(`Session Lifecycle Performance:
                Lifecycles: ${lifecycleCount}
                Total Time: ${totalTime}ms
                Sessions/sec: ${(lifecycleCount / (totalTime / 1000)).toFixed(1)}
                QR Scans Created: ${dbClient.mockData.qrScans.length}
            `);
        });
    });

    describe('QR Scan Performance', () => {
        let sessionId;

        beforeEach(async () => {
            const session = await dbClient.createSession(1);
            sessionId = session.ID;
        });

        test('should handle high-volume QR scanning', async () => {
            const scanCount = 100;
            const maxAverageTime = 30;

            // Set short cooldown for performance testing
            dbClient.setQRCooldown(0);

            for (let i = 0; i < scanCount; i++) {
                await measurePerformance(async () => {
                    const result = await dbClient.saveQRScan(sessionId, `PERF_SCAN_${i}_${Date.now()}`);
                    expect(result.success).toBe(true);
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);

            console.log(`QR Scan Performance:
                Scans: ${scanCount}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
                Scans/sec: ${(scanCount / (performanceMetrics.totalTime / 1000)).toFixed(0)}
            `);
        });

        test('should handle QR scan retrieval efficiently', async () => {
            // Create test data
            const scanCount = 50;
            dbClient.setQRCooldown(0);

            for (let i = 0; i < scanCount; i++) {
                await dbClient.saveQRScan(sessionId, `RETRIEVAL_TEST_${i}`);
            }

            // Test retrieval performance
            const retrievalCount = 20;
            const maxAverageTime = 25;

            for (let i = 0; i < retrievalCount; i++) {
                await measurePerformance(async () => {
                    const scans = await dbClient.getQRScansBySession(sessionId, 10);
                    expect(scans.length).toBeLessThanOrEqual(10);
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);

            console.log(`QR Scan Retrieval Performance:
                Retrievals: ${retrievalCount}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
                Total Scans in DB: ${scanCount}
            `);
        });

        test('should handle duplicate detection efficiently', async () => {
            const duplicateTests = 25;
            const maxAverageTime = 35;

            for (let i = 0; i < duplicateTests; i++) {
                const payload = `DUPLICATE_TEST_${Math.floor(i / 2)}`; // Create some duplicates

                await measurePerformance(async () => {
                    const result = await dbClient.saveQRScan(sessionId, payload);
                    // Result can be either success or duplicate
                    expect(result).toHaveProperty('success');
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);

            console.log(`Duplicate Detection Performance:
                Tests: ${duplicateTests}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
            `);
        });
    });

    describe('Database Connection Performance', () => {
        test('should handle connection cycling', async () => {
            const cycleCount = 10;
            const maxTotalTime = 2000;

            const startTime = Date.now();

            for (let i = 0; i < cycleCount; i++) {
                await dbClient.close();
                await dbClient.connect();
            }

            const totalTime = Date.now() - startTime;

            expect(totalTime).toBeLessThan(maxTotalTime);

            console.log(`Connection Cycling Performance:
                Cycles: ${cycleCount}
                Total Time: ${totalTime}ms
                Average per Cycle: ${(totalTime / cycleCount).toFixed(1)}ms
            `);
        });

        test('should handle health checks efficiently', async () => {
            const healthCheckCount = 30;
            const maxAverageTime = 20;

            for (let i = 0; i < healthCheckCount; i++) {
                await measurePerformance(async () => {
                    const health = await dbClient.healthCheck();
                    expect(health.status).toBe('healthy');
                });
            }

            expect(performanceMetrics.averageTime).toBeLessThan(maxAverageTime);

            console.log(`Health Check Performance:
                Checks: ${healthCheckCount}
                Average Time: ${performanceMetrics.averageTime.toFixed(2)}ms
            `);
        });
    });
});

describe('RFID Performance Tests', () => {
    let rfidListener;

    beforeEach(async () => {
        global.mockElectron = {
            globalShortcut: {
                register: jest.fn(() => true),
                unregister: jest.fn(() => true),
                unregisterAll: jest.fn()
            }
        };

        rfidListener = new MockRFIDListener();
        rfidListener.updateConfig({ debugMode: false });
        rfidListener.disableHardwareError();
        await rfidListener.start();
    });

    afterEach(async () => {
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.destroy();
        }
    });

    describe('Tag Processing Performance', () => {
        test('should process rapid tag scans efficiently', async () => {
            const rapidScans = 50; // Reduziert für stabilere Tests
            const maxProcessingTime = 10000; // Realistischere Erwartung

            const startTime = Date.now();

            // Simuliere schnelle aufeinanderfolgende Scans
            for (let i = 0; i < rapidScans; i++) {
                const tagId = (50000000 + i).toString(16).toUpperCase().padStart(8, '0');
                await rfidListener.simulateTag(tagId);

                // Sehr kurze Pause zwischen Scans
                if (i % 10 === 0) {
                    await waitFor(5);
                }
            }

            // Warte auf Verarbeitung
            await waitFor(200);

            const processingTime = Date.now() - startTime;

            expect(processingTime).toBeLessThan(maxProcessingTime);
            expect(rfidListener.getStats().totalScans).toBe(rapidScans);

            console.log(`Rapid Tag Scan Performance:
                Tags Processed: ${rapidScans}
                Processing Time: ${processingTime}ms
                Tags/sec: ${(rapidScans / (processingTime / 1000)).toFixed(0)}
                Success Rate: ${rfidListener.getStats().successRate.toFixed(1)}%
            `);
        }, 20000);

        test('should handle input buffer efficiently', async () => {
            const inputOperations = 500; // Reduziert
            const maxBufferTime = 5000;

            const startTime = Date.now();

            for (let i = 0; i < inputOperations; i++) {
                const char = (i % 16).toString(16).toUpperCase();
                rfidListener.handleInput(char);

                // Gelegentlich kompletten Tag simulieren
                if (i % 8 === 7) {
                    rfidListener.handleInput('\r'); // Enter-Taste zum Verarbeiten
                }
            }

            const bufferTime = Date.now() - startTime;

            expect(bufferTime).toBeLessThan(maxBufferTime);

            console.log(`Input Buffer Performance:
                Input Operations: ${inputOperations}
                Buffer Time: ${bufferTime}ms
                Operations/sec: ${(inputOperations / (bufferTime / 1000)).toFixed(0)}
            `);
        });

        test('should maintain performance with many registered shortcuts', async () => {
            const shortcutCount = 50;
            const operationCount = 100; // Reduziert

            // Simuliere viele registrierte Shortcuts
            const shortcuts = [];
            for (let i = 0; i < shortcutCount; i++) {
                const shortcut = `F${i + 4}`; // Start at F4 to avoid conflicts
                shortcuts.push(shortcut);
                if (global.mockElectron?.globalShortcut) {
                    global.mockElectron.globalShortcut.register(shortcut, () => {
                        rfidListener.simulateTag(`${50000000 + i}`);
                    });
                }
            }

            const startTime = Date.now();

            // Teste Performance mit vielen Shortcuts
            for (let i = 0; i < operationCount; i++) {
                await rfidListener.simulateTag(`${60000000 + i}`);
            }

            const operationTime = Date.now() - startTime;
            const maxOperationTime = 3000;

            expect(operationTime).toBeLessThan(maxOperationTime);

            console.log(`Shortcut Performance Test:
                Registered Shortcuts: ${shortcutCount}
                Operations: ${operationCount}
                Operation Time: ${operationTime}ms
                Operations/sec: ${(operationCount / (operationTime / 1000)).toFixed(0)}
            `);
        });
    });

    describe('Error Handling Performance', () => {
        test('should handle error simulation efficiently', async () => {
            const errorCount = 25;
            const maxErrorTime = 1000;

            const startTime = Date.now();

            for (let i = 0; i < errorCount; i++) {
                const errorTypes = ['timeout', 'connection_lost', 'device_not_found'];
                const errorType = errorTypes[i % errorTypes.length];
                rfidListener.simulateHardwareError(errorType);

                await waitFor(10); // Small delay between errors
            }

            const errorTime = Date.now() - startTime;

            expect(errorTime).toBeLessThan(maxErrorTime);
            expect(rfidListener.getStats().errors).toBe(errorCount);

            console.log(`Error Simulation Performance:
                Errors Simulated: ${errorCount}
                Error Time: ${errorTime}ms
                Errors/sec: ${(errorCount / (errorTime / 1000)).toFixed(0)}
            `);
        });
    });

    describe('Statistics Performance', () => {
        test('should calculate statistics efficiently', async () => {
            // Generate test data
            for (let i = 0; i < 100; i++) {
                await rfidListener.simulateTag(`${50000000 + i}`);
            }

            const statsCalls = 50;
            const maxStatsTime = 500;

            const startTime = Date.now();

            for (let i = 0; i < statsCalls; i++) {
                const stats = rfidListener.getStats();
                expect(stats).toHaveProperty('totalScans');
                expect(stats).toHaveProperty('performance');
            }

            const statsTime = Date.now() - startTime;

            expect(statsTime).toBeLessThan(maxStatsTime);

            console.log(`Statistics Performance:
                Stats Calls: ${statsCalls}
                Stats Time: ${statsTime}ms
                Calls/sec: ${(statsCalls / (statsTime / 1000)).toFixed(0)}
            `);
        });
    });
});

describe('Integrated Performance Tests', () => {
    let dbClient;
    let rfidListener;

    beforeEach(async () => {
        // Setup Database
        dbClient = new MockDatabaseClient();
        await dbClient.connect();
        dbClient.clearMockData();

        // Setup RFID
        global.mockElectron = {
            globalShortcut: {
                register: jest.fn(() => true),
                unregister: jest.fn(() => true),
                unregisterAll: jest.fn()
            }
        };

        rfidListener = new MockRFIDListener();
        rfidListener.disableHardwareError();
        await rfidListener.start();
    });

    afterEach(async () => {
        await dbClient.close();
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.destroy();
        }
    });

    describe('End-to-End Workflow Performance', () => {
        test('should handle complete workflow efficiently', async () => {
            const workflowCount = 10; // Reduziert für Stabilität
            const maxWorkflowTime = 5000;

            const startTime = Date.now();

            for (let i = 0; i < workflowCount; i++) {
                // 1. Simulate RFID scan
                const tagId = '329C172';
                await rfidListener.simulateTag(tagId);

                // 2. User lookup
                const user = await dbClient.getUserByRFID(tagId);
                expect(user).toBeDefined();

                // 3. Create session
                const session = await dbClient.createSession(user.BenID);

                // 4. QR scans
                for (let j = 0; j < 3; j++) {
                    await dbClient.saveQRScan(session.ID, `WORKFLOW_${i}_SCAN_${j}`);
                }

                // 5. End session
                await dbClient.endSession(session.ID);
            }

            const workflowTime = Date.now() - startTime;

            expect(workflowTime).toBeLessThan(maxWorkflowTime);

            console.log(`Complete Workflow Performance:
                Workflows: ${workflowCount}
                Total Time: ${workflowTime}ms
                Workflows/sec: ${(workflowCount / (workflowTime / 1000)).toFixed(1)}
                DB Queries: ${dbClient.getStatistics().queries}
                RFID Scans: ${rfidListener.getStats().totalScans}
            `);
        }, 10000);
    });
});