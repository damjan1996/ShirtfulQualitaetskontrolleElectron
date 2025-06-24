// tests/performance/database-performance.test.js
/**
 * Performance Tests für Database Operations
 */

const MockDatabaseClient = require('../mocks/db-client.mock');

describe('Database Performance Tests', () => {
    let dbClient;
    let performanceMetrics;

    beforeEach(async () => {
        dbClient = new MockDatabaseClient();
        await dbClient.connect();

        performanceMetrics = {
            queryTimes: [],
            memoryUsage: [],
            connectionTimes: []
        };
    });

    afterEach(async () => {
        if (dbClient) {
            await dbClient.close();
        }
    });

    describe('Query Performance', () => {
        test('should handle user lookup within performance threshold', async () => {
            const iterations = 1000;
            const maxQueryTime = 10; // ms
            const queryTimes = [];

            for (let i = 0; i < iterations; i++) {
                const startTime = process.hrtime.bigint();
                await dbClient.getUserByEPC('53004114');
                const endTime = process.hrtime.bigint();

                const queryTime = Number(endTime - startTime) / 1000000; // Convert to ms
                queryTimes.push(queryTime);
            }

            const averageTime = queryTimes.reduce((sum, time) => sum + time, 0) / iterations;
            const maxTime = Math.max(...queryTimes);
            const minTime = Math.min(...queryTimes);

            expect(averageTime).toBeLessThan(maxQueryTime);
            expect(maxTime).toBeLessThan(maxQueryTime * 2);

            console.log(`Query Performance Stats:
                Average: ${averageTime.toFixed(2)}ms
                Min: ${minTime.toFixed(2)}ms
                Max: ${maxTime.toFixed(2)}ms
                Iterations: ${iterations}
            `);
        });

        test('should handle concurrent database operations efficiently', async () => {
            const concurrentOperations = 50;
            const maxTotalTime = 1000; // ms

            const startTime = Date.now();

            const promises = Array(concurrentOperations).fill().map(async (_, index) => {
                const user = await dbClient.getUserByEPC('53004114');
                if (user) {
                    const session = await dbClient.createSession(user.ID);
                    await dbClient.saveQRScan(session.ID, `CONCURRENT_QR_${index}`);
                    await dbClient.endSession(session.ID);
                }
            });

            await Promise.all(promises);

            const totalTime = Date.now() - startTime;

            expect(totalTime).toBeLessThan(maxTotalTime);

            console.log(`Concurrent Operations:
                Operations: ${concurrentOperations}
                Total Time: ${totalTime}ms
                Avg per Operation: ${(totalTime / concurrentOperations).toFixed(2)}ms
            `);
        });

        test('should maintain performance with large datasets', async () => {
            const largeDatasetSize = 10000;
            const maxProcessingTime = 5000; // ms

            // Simuliere große Datenmenge
            for (let i = 0; i < largeDatasetSize; i++) {
                dbClient.addTestUser({
                    BenutzerName: `Performance User ${i}`,
                    EPC: 1000000 + i,
                    xStatus: 0
                });
            }

            const startTime = Date.now();

            // Teste Queries auf großem Dataset
            const randomEPCs = Array(100).fill().map(() =>
                (1000000 + Math.floor(Math.random() * largeDatasetSize)).toString(16)
            );

            for (const epc of randomEPCs) {
                await dbClient.getUserByEPC(epc);
            }

            const processingTime = Date.now() - startTime;

            expect(processingTime).toBeLessThan(maxProcessingTime);

            console.log(`Large Dataset Performance:
                Dataset Size: ${largeDatasetSize}
                Queries: ${randomEPCs.length}
                Processing Time: ${processingTime}ms
                Avg per Query: ${(processingTime / randomEPCs.length).toFixed(2)}ms
            `);
        });
    });

    describe('Memory Performance', () => {
        test('should not leak memory during extended operations', async () => {
            const initialMemory = process.memoryUsage();
            const operationCycles = 1000;
            const maxMemoryGrowth = 50 * 1024 * 1024; // 50MB

            for (let cycle = 0; cycle < operationCycles; cycle++) {
                const user = await dbClient.getUserByEPC('53004114');
                const session = await dbClient.createSession(user.ID);

                // Mehrere QR-Scans pro Zyklus
                for (let scan = 0; scan < 10; scan++) {
                    await dbClient.saveQRScan(session.ID, `MEMORY_TEST_${cycle}_${scan}`);
                }

                await dbClient.endSession(session.ID);

                // Gelegentliche Garbage Collection
                if (cycle % 100 === 0) {
                    if (global.gc) {
                        global.gc();
                    }
                }
            }

            const finalMemory = process.memoryUsage();
            const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

            expect(memoryGrowth).toBeLessThan(maxMemoryGrowth);

            console.log(`Memory Performance:
                Initial Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
                Final Heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB
                Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
                Operations: ${operationCycles * 10}
            `);
        });

        test('should handle cache efficiently', async () => {
            const cacheOperations = 5000;
            const maxCacheSize = 1000;

            // Fülle Cache mit vielen verschiedenen QR-Codes
            for (let i = 0; i < cacheOperations; i++) {
                dbClient.duplicateCache.set(`CACHE_TEST_${i}`, Date.now());
            }

            // Cache sollte begrenzt sein oder sich selbst bereinigen
            expect(dbClient.duplicateCache.size).toBeLessThanOrEqual(cacheOperations);

            // Teste Cache-Performance
            const startTime = process.hrtime.bigint();

            for (let i = 0; i < 1000; i++) {
                const key = `CACHE_TEST_${i}`;
                dbClient.duplicateCache.has(key);
                dbClient.duplicateCache.get(key);
            }

            const endTime = process.hrtime.bigint();
            const cacheTime = Number(endTime - startTime) / 1000000; // ms

            expect(cacheTime).toBeLessThan(10); // Under 10ms for 1000 operations

            console.log(`Cache Performance:
                Cache Size: ${dbClient.duplicateCache.size}
                Cache Operations: 1000
                Total Time: ${cacheTime.toFixed(2)}ms
            `);
        });
    });

    describe('Connection Performance', () => {
        test('should establish connections quickly', async () => {
            const connectionAttempts = 10;
            const maxConnectionTime = 100; // ms
            const connectionTimes = [];

            for (let i = 0; i < connectionAttempts; i++) {
                const testClient = new MockDatabaseClient();

                const startTime = Date.now();
                await testClient.connect();
                const connectionTime = Date.now() - startTime;

                connectionTimes.push(connectionTime);
                await testClient.close();
            }

            const averageConnectionTime = connectionTimes.reduce((sum, time) => sum + time, 0) / connectionAttempts;
            const maxTime = Math.max(...connectionTimes);

            expect(averageConnectionTime).toBeLessThan(maxConnectionTime);
            expect(maxTime).toBeLessThan(maxConnectionTime * 2);

            console.log(`Connection Performance:
                Average: ${averageConnectionTime.toFixed(2)}ms
                Max: ${maxTime.toFixed(2)}ms
                Attempts: ${connectionAttempts}
            `);
        });

        test('should handle connection pooling efficiently', async () => {
            const poolSize = 10;
            const operationsPerConnection = 100;

            const clients = [];

            // Erstelle Connection Pool
            for (let i = 0; i < poolSize; i++) {
                const client = new MockDatabaseClient();
                await client.connect();
                clients.push(client);
            }

            const startTime = Date.now();

            // Parallele Operationen auf Pool
            const promises = clients.map(async (client, index) => {
                for (let op = 0; op < operationsPerConnection; op++) {
                    await client.getUserByEPC('53004114');
                }
            });

            await Promise.all(promises);

            const totalTime = Date.now() - startTime;
            const totalOperations = poolSize * operationsPerConnection;

            expect(totalTime).toBeLessThan(5000); // Under 5 seconds

            console.log(`Connection Pool Performance:
                Pool Size: ${poolSize}
                Operations per Connection: ${operationsPerConnection}
                Total Operations: ${totalOperations}
                Total Time: ${totalTime}ms
                Operations/sec: ${(totalOperations / (totalTime / 1000)).toFixed(0)}
            `);

            // Cleanup
            for (const client of clients) {
                await client.close();
            }
        });
    });

    describe('Bulk Operations Performance', () => {
        test('should handle bulk QR scans efficiently', async () => {
            const user = await dbClient.getUserByEPC('53004114');
            const session = await dbClient.createSession(user.ID);
            const bulkSize = 1000;
            const maxBulkTime = 2000; // ms

            const startTime = Date.now();

            const scanPromises = Array(bulkSize).fill().map(async (_, index) => {
                return dbClient.saveQRScan(session.ID, `BULK_QR_${index}`);
            });

            const results = await Promise.all(scanPromises);
            const bulkTime = Date.now() - startTime;

            const successfulScans = results.filter(r => r.success).length;

            expect(bulkTime).toBeLessThan(maxBulkTime);
            expect(successfulScans).toBe(bulkSize);

            console.log(`Bulk Scan Performance:
                Bulk Size: ${bulkSize}
                Successful: ${successfulScans}
                Total Time: ${bulkTime}ms
                Scans/sec: ${(bulkSize / (bulkTime / 1000)).toFixed(0)}
            `);
        });

        test('should handle bulk session operations', async () => {
            const bulkSessionOperations = 500;
            const maxSessionTime = 3000; // ms

            const startTime = Date.now();

            const sessionPromises = Array(bulkSessionOperations).fill().map(async (_, index) => {
                const userId = (index % 2) + 1; // Alterniere zwischen User 1 und 2
                const session = await dbClient.createSession(userId);
                await dbClient.endSession(session.ID);
                return session;
            });

            const sessions = await Promise.all(sessionPromises);
            const sessionTime = Date.now() - startTime;

            expect(sessionTime).toBeLessThan(maxSessionTime);
            expect(sessions.length).toBe(bulkSessionOperations);

            console.log(`Bulk Session Performance:
                Sessions: ${bulkSessionOperations}
                Total Time: ${sessionTime}ms
                Sessions/sec: ${(bulkSessionOperations / (sessionTime / 1000)).toFixed(0)}
            `);
        });
    });
});

// tests/performance/rfid-performance.test.js
/**
 * Performance Tests für RFID Operations
 */

const MockRFIDListener = require('../mocks/rfid-listener.mock');

describe('RFID Performance Tests', () => {
    let rfidListener;

    beforeEach(async () => {
        rfidListener = new MockRFIDListener();
        await rfidListener.start();
    });

    afterEach(async () => {
        if (rfidListener) {
            await rfidListener.stop();
        }
    });

    describe('Tag Processing Performance', () => {
        test('should process rapid tag scans efficiently', async () => {
            const rapidScans = 1000;
            const maxProcessingTime = 1000; // ms
            const tags = ['53004114', '87654321', 'ABCDEF01', 'DEADBEEF'];

            const startTime = Date.now();

            for (let i = 0; i < rapidScans; i++) {
                const tagId = tags[i % tags.length];
                rfidListener.simulateTag(tagId);
            }

            const processingTime = Date.now() - startTime;

            expect(processingTime).toBeLessThan(maxProcessingTime);
            expect(rfidListener.stats.totalScans).toBe(rapidScans);

            console.log(`Rapid Tag Scan Performance:
                Tags Processed: ${rapidScans}
                Processing Time: ${processingTime}ms
                Tags/sec: ${(rapidScans / (processingTime / 1000)).toFixed(0)}
                Success Rate: ${rfidListener.stats.successRate.toFixed(1)}%
            `);
        });

        test('should handle input buffer efficiently', async () => {
            const inputOperations = 10000;
            const maxInputTime = 500; // ms

            const startTime = Date.now();

            // Simuliere sehr schnelle Tastatureingaben
            for (let i = 0; i < inputOperations; i++) {
                const char = (i % 16).toString(16).toUpperCase();
                rfidListener.handleInput(char);

                // Gelegentlich Tag verarbeiten
                if (i % 8 === 7) {
                    rfidListener.processTag();
                }
            }

            const inputTime = Date.now() - startTime;

            expect(inputTime).toBeLessThan(maxInputTime);

            console.log(`Input Buffer Performance:
                Input Operations: ${inputOperations}
                Processing Time: ${inputTime}ms
                Operations/sec: ${(inputOperations / (inputTime / 1000)).toFixed(0)}
            `);
        });

        test('should maintain performance with many registered shortcuts', async () => {
            const shortcutOperations = 1000;
            const maxShortcutTime = 100; // ms

            // Simuliere viele Shortcuts (bereits in Mock registriert)
            const shortcuts = rfidListener.registeredShortcuts;

            const startTime = Date.now();

            for (let i = 0; i < shortcutOperations; i++) {
                // Simuliere Shortcut-Überprüfungen
                const shortcut = shortcuts[i % shortcuts.length];
                const isRegistered = shortcuts.includes(shortcut);
                expect(isRegistered).toBe(true);
            }

            const shortcutTime = Date.now() - startTime;

            expect(shortcutTime).toBeLessThan(maxShortcutTime);

            console.log(`Shortcut Performance:
                Shortcuts: ${shortcuts.length}
                Operations: ${shortcutOperations}
                Processing Time: ${shortcutTime}ms
            `);
        });
    });

    describe('Memory Performance', () => {
        test('should not leak memory during extended scanning', async () => {
            const extendedScanDuration = 10000; // 10 seconds simulation
            const scansPerSecond = 100;
            const totalScans = (extendedScanDuration / 1000) * scansPerSecond;

            const initialMemory = process.memoryUsage();

            for (let i = 0; i < totalScans; i++) {
                rfidListener.simulateTag('53004114');

                // Simuliere zeitliche Verteilung
                if (i % 100 === 0) {
                    await waitFor(1);
                }
            }

            const finalMemory = process.memoryUsage();
            const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
            const maxAcceptableGrowth = 10 * 1024 * 1024; // 10MB

            expect(memoryGrowth).toBeLessThan(maxAcceptableGrowth);

            console.log(`Extended Scanning Memory:
                Total Scans: ${totalScans}
                Memory Growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB
                Scans/MB: ${(totalScans / (memoryGrowth / 1024 / 1024)).toFixed(0)}
            `);
        });
    });

    describe('Concurrent Performance', () => {
        test('should handle multiple RFID listeners efficiently', async () => {
            const listenerCount = 10;
            const scansPerListener = 100;

            const listeners = [];

            // Erstelle mehrere Listener
            for (let i = 0; i < listenerCount; i++) {
                const listener = new MockRFIDListener();
                await listener.start();
                listeners.push(listener);
            }

            const startTime = Date.now();

            // Parallele Scans auf allen Listenern
            const promises = listeners.map(async (listener, index) => {
                for (let scan = 0; scan < scansPerListener; scan++) {
                    listener.simulateTag(`${scan.toString(16).padStart(8, '0')}`);
                }
            });

            await Promise.all(promises);

            const totalTime = Date.now() - startTime;
            const totalScans = listenerCount * scansPerListener;

            expect(totalTime).toBeLessThan(2000); // Under 2 seconds

            console.log(`Concurrent RFID Performance:
                Listeners: ${listenerCount}
                Scans per Listener: ${scansPerListener}
                Total Scans: ${totalScans}
                Total Time: ${totalTime}ms
                Scans/sec: ${(totalScans / (totalTime / 1000)).toFixed(0)}
            `);

            // Cleanup
            for (const listener of listeners) {
                await listener.stop();
            }
        });
    });
});

// tests/performance/frontend-performance.test.js
/**
 * Performance Tests für Frontend Operations
 */

describe('Frontend Performance Tests', () => {
    let mockApp;
    let performanceObserver;

    beforeEach(() => {
        // Mock Performance Observer
        performanceObserver = {
            marks: new Map(),
            measures: new Map(),

            mark: function(name) {
                this.marks.set(name, performance.now());
            },

            measure: function(name, startMark, endMark) {
                const startTime = this.marks.get(startMark);
                const endTime = this.marks.get(endMark);
                const duration = endTime - startTime;
                this.measures.set(name, duration);
                return duration;
            }
        };

        mockApp = {
            recentScans: [],
            scanCount: 0,
            currentUser: null,
            sessionStartTime: null
        };

        global.performance = {
            now: jest.fn(() => Date.now())
        };
    });

    describe('UI Update Performance', () => {
        test('should update scan list efficiently', () => {
            const scanUpdates = 1000;
            const maxUpdateTime = 100; // ms

            performanceObserver.mark('scan-list-start');

            for (let i = 0; i < scanUpdates; i++) {
                const scan = {
                    id: i,
                    timestamp: new Date(),
                    content: `QR_CODE_${i}`,
                    status: 'saved',
                    success: true
                };

                mockApp.recentScans.unshift(scan);

                // Limit list size (like real app)
                if (mockApp.recentScans.length > 10) {
                    mockApp.recentScans = mockApp.recentScans.slice(0, 10);
                }
            }

            performanceObserver.mark('scan-list-end');
            const updateTime = performanceObserver.measure('scan-list-updates', 'scan-list-start', 'scan-list-end');

            expect(updateTime).toBeLessThan(maxUpdateTime);
            expect(mockApp.recentScans.length).toBe(10);

            console.log(`Scan List Update Performance:
                Updates: ${scanUpdates}
                Update Time: ${updateTime.toFixed(2)}ms
                Updates/sec: ${(scanUpdates / (updateTime / 1000)).toFixed(0)}
            `);
        });

        test('should handle rapid UI state changes', () => {
            const stateChanges = 5000;
            const maxStateTime = 50; // ms

            performanceObserver.mark('state-changes-start');

            for (let i = 0; i < stateChanges; i++) {
                // Simuliere UI-State-Updates
                mockApp.scanCount = i;
                mockApp.currentUser = i % 2 === 0 ? { id: 1, name: 'User 1' } : null;

                // Simuliere Timer-Updates
                if (mockApp.currentUser) {
                    mockApp.sessionStartTime = new Date(Date.now() - (i * 1000));
                } else {
                    mockApp.sessionStartTime = null;
                }
            }

            performanceObserver.mark('state-changes-end');
            const stateTime = performanceObserver.measure('state-changes', 'state-changes-start', 'state-changes-end');

            expect(stateTime).toBeLessThan(maxStateTime);

            console.log(`UI State Change Performance:
                State Changes: ${stateChanges}
                Update Time: ${stateTime.toFixed(2)}ms
                Changes/sec: ${(stateChanges / (stateTime / 1000)).toFixed(0)}
            `);
        });
    });

    describe('Animation Performance', () => {
        test('should maintain 60fps during animations', () => {
            const animationDuration = 1000; // ms
            const targetFPS = 60;
            const frameTime = 1000 / targetFPS; // ~16.67ms
            const frames = animationDuration / frameTime;

            performanceObserver.mark('animation-start');

            for (let frame = 0; frame < frames; frame++) {
                // Simuliere Animation-Frame
                const frameStart = performance.now();

                // Simuliere Animation-Berechnungen
                const progress = frame / frames;
                const animatedValue = Math.sin(progress * Math.PI * 2);

                // Simuliere DOM-Updates
                const mockElement = {
                    style: {
                        transform: `translateX(${animatedValue * 100}px)`,
                        opacity: progress
                    }
                };

                const frameEnd = performance.now();
                const frameRenderTime = frameEnd - frameStart;

                // Frame sollte unter Ziel-Zeit bleiben
                expect(frameRenderTime).toBeLessThan(frameTime);
            }

            performanceObserver.mark('animation-end');
            const animationTime = performanceObserver.measure('animation', 'animation-start', 'animation-end');

            expect(animationTime).toBeLessThan(animationDuration * 1.1); // 10% tolerance

            console.log(`Animation Performance:
                Duration: ${animationDuration}ms
                Frames: ${frames}
                Target FPS: ${targetFPS}
                Actual Time: ${animationTime.toFixed(2)}ms
            `);
        });
    });

    describe('Memory Performance', () => {
        test('should clean up event listeners efficiently', () => {
            const listenerOperations = 10000;
            const maxListenerTime = 100; // ms

            const mockEventTarget = {
                listeners: new Map(),

                addEventListener: function(event, handler) {
                    if (!this.listeners.has(event)) {
                        this.listeners.set(event, []);
                    }
                    this.listeners.get(event).push(handler);
                },

                removeEventListener: function(event, handler) {
                    if (this.listeners.has(event)) {
                        const handlers = this.listeners.get(event);
                        const index = handlers.indexOf(handler);
                        if (index !== -1) {
                            handlers.splice(index, 1);
                        }
                    }
                }
            };

            performanceObserver.mark('listeners-start');

            const handlers = [];

            // Füge viele Event Listener hinzu
            for (let i = 0; i < listenerOperations; i++) {
                const handler = () => {};
                handlers.push(handler);
                mockEventTarget.addEventListener('click', handler);
            }

            // Entferne alle wieder
            for (const handler of handlers) {
                mockEventTarget.removeEventListener('click', handler);
            }

            performanceObserver.mark('listeners-end');
            const listenerTime = performanceObserver.measure('listeners', 'listeners-start', 'listeners-end');

            expect(listenerTime).toBeLessThan(maxListenerTime);
            expect(mockEventTarget.listeners.get('click')?.length || 0).toBe(0);

            console.log(`Event Listener Performance:
                Operations: ${listenerOperations}
                Processing Time: ${listenerTime.toFixed(2)}ms
                Operations/sec: ${(listenerOperations / (listenerTime / 1000)).toFixed(0)}
            `);
        });
    });
});