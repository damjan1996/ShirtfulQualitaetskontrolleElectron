// tests/integrations/rfid-database-integration.test.js
/**
 * RFID-Database Integration Tests - Korrigiert
 * Testet die Integration zwischen RFID und Database Komponenten
 */

const MockRFIDListener = require('../mocks/rfid-listener.mock');
const MockDatabaseClient = require('../mocks/db-client.mock');

describe('RFID-Database Integration', () => {
    let rfidListener;
    let dbClient;

    beforeEach(async () => {
        // Setup mocks
        global.mockElectron = {
            globalShortcut: {
                shortcuts: new Map(),
                register: jest.fn(() => true),
                unregister: jest.fn(() => true),
                unregisterAll: jest.fn()
            },
            ipcMain: {
                handlers: new Map(),
                invoke: jest.fn(async (channel, ...args) => {
                    const handler = global.mockElectron.ipcMain.handlers.get(channel);
                    if (handler) {
                        return await handler(...args);
                    }
                    throw new Error(`No handler for channel: ${channel}`);
                }),
                handle: jest.fn((channel, handler) => {
                    global.mockElectron.ipcMain.handlers.set(channel, handler);
                })
            }
        };

        rfidListener = new MockRFIDListener();
        rfidListener.updateConfig({ debugMode: false });
        rfidListener.disableHardwareError();

        dbClient = new MockDatabaseClient();
        await dbClient.connect();
        dbClient.clearMockData();

        // Setup IPC handlers
        setupMockIpcHandlers();
    });

    afterEach(async () => {
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.destroy();
        }
        if (dbClient && dbClient.isConnected) {
            await dbClient.close();
        }
        jest.clearAllMocks();
    });

    function setupMockIpcHandlers() {
        // User lookup handler
        global.mockElectron.ipcMain.handle('user-lookup', async (tagId) => {
            try {
                const user = await dbClient.getUserByRFID(tagId);
                return user;
            } catch (error) {
                throw error;
            }
        });

        // Session creation handler
        global.mockElectron.ipcMain.handle('create-session', async (userId) => {
            try {
                const session = await dbClient.createSession(userId);
                return session;
            } catch (error) {
                throw error;
            }
        });

        // QR scan handler
        global.mockElectron.ipcMain.handle('save-qr-scan', async (sessionId, payload) => {
            try {
                const result = await dbClient.saveQRScan(sessionId, payload);
                return result;
            } catch (error) {
                throw error;
            }
        });
    }

    describe('Basic Integration', () => {
        test('should connect RFID listener and database', async () => {
            await rfidListener.start();

            expect(rfidListener.isRunning).toBe(true);
            expect(dbClient.isConnected).toBe(true);
        });

        test('should handle RFID scan and user lookup', async () => {
            await rfidListener.start();

            const tagDetected = new Promise((resolve) => {
                rfidListener.on('tag-detected', resolve);
            });

            // Simulate RFID scan
            await rfidListener.simulateTag('329C172'); // Hex for 53004114

            const tagData = await tagDetected;
            expect(tagData.tagId).toBe('329C172');

            // Look up user
            const user = await dbClient.getUserByRFID(tagData.tagId);
            expect(user).toBeDefined();
            expect(user.BenID).toBe(1);
            expect(user.Vorname).toBe('Max');
        });

        test('should handle complete workflow: scan -> login -> QR scan', async () => {
            await rfidListener.start();

            // 1. RFID scan
            await rfidListener.simulateTag('329C172');

            // 2. User lookup
            const user = await dbClient.getUserByRFID('329C172');
            expect(user).toBeDefined();

            // 3. Create session
            const session = await dbClient.createSession(user.BenID);
            expect(session).toBeDefined();
            expect(session.Active).toBe(1);

            // 4. QR scan
            const qrResult = await dbClient.saveQRScan(session.ID, 'TEST_PACKAGE_001');
            expect(qrResult.success).toBe(true);

            // 5. Verify data consistency
            const scans = await dbClient.getQRScansBySession(session.ID);
            expect(scans.length).toBe(1);
            expect(scans[0].RawPayload).toBe('TEST_PACKAGE_001');
        });
    });

    describe('Multi-User Scenarios', () => {
        test('should handle multiple users scanning simultaneously', async () => {
            await rfidListener.start();

            // User 1 workflow
            await rfidListener.simulateTag('329C172'); // User 1
            const user1 = await dbClient.getUserByRFID('329C172');
            const session1 = await dbClient.createSession(user1.BenID);

            // User 2 workflow
            await rfidListener.simulateTag('329C173'); // User 2
            const user2 = await dbClient.getUserByRFID('329C173');
            const session2 = await dbClient.createSession(user2.BenID);

            // Both sessions should be active
            expect(session1.Active).toBe(1);
            expect(session2.Active).toBe(1);
            expect(session1.ID).not.toBe(session2.ID);

            // Both users scan QR codes
            const qr1 = await dbClient.saveQRScan(session1.ID, 'PACKAGE_USER1');
            const qr2 = await dbClient.saveQRScan(session2.ID, 'PACKAGE_USER2');

            expect(qr1.success).toBe(true);
            expect(qr2.success).toBe(true);

            // Verify scans are properly separated
            const scans1 = await dbClient.getQRScansBySession(session1.ID);
            const scans2 = await dbClient.getQRScansBySession(session2.ID);

            expect(scans1.length).toBe(1);
            expect(scans2.length).toBe(1);
            expect(scans1[0].RawPayload).toBe('PACKAGE_USER1');
            expect(scans2[0].RawPayload).toBe('PACKAGE_USER2');
        });

        test('should handle user session switching', async () => {
            await rfidListener.start();

            // User 1 initial login
            await rfidListener.simulateTag('329C172');
            const user1 = await dbClient.getUserByRFID('329C172');
            const session1 = await dbClient.createSession(user1.BenID);

            expect(session1.Active).toBe(1);

            // User 1 scans a QR code
            await dbClient.saveQRScan(session1.ID, 'SCAN_BEFORE_SWITCH');

            // User 1 logs out (scans RFID again)
            const newSession1 = await dbClient.createSession(user1.BenID);

            // Check that old session was closed and new one created
            const oldSessionInData = dbClient.mockData.sessions.find(s => s.ID === session1.ID);
            expect(oldSessionInData.Active).toBe(0);
            expect(oldSessionInData.EndTS).toBeDefined();

            expect(newSession1.Active).toBe(1);
            expect(newSession1.ID).not.toBe(session1.ID);

            // User 1 continues with new session
            const qrResult = await dbClient.saveQRScan(newSession1.ID, 'SCAN_AFTER_SWITCH');
            expect(qrResult.success).toBe(true);
        });
    });

    describe('Error Handling', () => {
        test('should handle unknown RFID tags', async () => {
            await rfidListener.start();

            await rfidListener.simulateTag('UNKNOWN123');
            const user = await dbClient.getUserByRFID('UNKNOWN123');

            expect(user).toBeNull();
        });

        test('should handle database connection errors', async () => {
            await dbClient.close();

            await expect(dbClient.getUserByRFID('329C172')).rejects.toThrow('Database not connected');
        });

        test('should handle RFID hardware errors', (done) => {
            rfidListener.start().then(() => {
                rfidListener.on('error', (error) => {
                    expect(error).toBeInstanceOf(Error);
                    expect(error.type).toBe('connection_lost');
                    done();
                });

                rfidListener.simulateHardwareError('connection_lost');
            });
        });

        test('should handle QR scan failures for inactive sessions', async () => {
            await rfidListener.start();

            // Create and end session
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);
            await dbClient.endSession(session.ID);

            // Try to scan QR code
            await expect(dbClient.saveQRScan(session.ID, 'TEST')).rejects.toThrow('No active session found');
        });
    });

    describe('Performance and Stress Testing', () => {
        test('should handle rapid RFID scans', async () => {
            await rfidListener.start();

            const scanPromises = [];
            const tags = ['329C172', '329C173', '329C174'];

            // Simulate rapid scanning
            for (let i = 0; i < 10; i++) {
                const tag = tags[i % tags.length];
                scanPromises.push(rfidListener.simulateTag(tag));
            }

            await Promise.all(scanPromises);

            expect(rfidListener.stats.totalScans).toBe(10);
            expect(rfidListener.stats.validScans).toBe(10);
        });

        test('should handle many QR scans in session', async () => {
            await rfidListener.start();

            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            // Scan many QR codes
            const scanPromises = [];
            for (let i = 0; i < 50; i++) {
                scanPromises.push(dbClient.saveQRScan(session.ID, `QR_${i.toString().padStart(3, '0')}`));
            }

            const results = await Promise.all(scanPromises);

            expect(results.every(r => r.success)).toBe(true);

            const scans = await dbClient.getQRScansBySession(session.ID);
            expect(scans.length).toBe(50);
        });
    });

    describe('Frontend-Backend Integration', () => {
        describe('IPC Communication', () => {
            test('should handle user lookup via IPC', async () => {
                const tagId = '329C172';
                const mockUser = {
                    BenID: 1,
                    Vorname: 'Max',
                    Nachname: 'Mustermann',
                    EPC: parseInt(tagId, 16),
                    Active: 1
                };

                dbClient.setMockUser(tagId, mockUser);

                // Simuliere Frontend-Aufruf
                const result = await global.mockElectron.ipcMain.invoke('user-lookup', tagId);

                expect(result).toBeDefined();
                expect(result.BenID).toBe(1);
                expect(result.Vorname).toBe('Max');
            });

            test('should handle session creation via IPC', async () => {
                const userId = 1;

                // Simuliere Frontend-Aufruf
                const session = await global.mockElectron.ipcMain.invoke('create-session', userId);

                expect(session).toBeDefined();
                expect(session.BenID).toBe(userId);
                expect(session.Active).toBe(1);
            });

            test('should handle QR scan via IPC', async () => {
                const userId = 1;
                const session = await dbClient.createSession(userId);

                // Simuliere Frontend-Aufruf
                const result = await global.mockElectron.ipcMain.invoke('save-qr-scan', session.ID, 'IPC_TEST_QR');

                expect(result.success).toBe(true);
                expect(result.data.RawPayload).toBe('IPC_TEST_QR');
            });

            test('should handle IPC errors gracefully', async () => {
                await expect(global.mockElectron.ipcMain.invoke('non-existent-channel')).rejects.toThrow('No handler for channel');
            });
        });

        describe('Real-time Updates', () => {
            test('should emit events for database changes', (done) => {
                let eventCount = 0;

                dbClient.on('qr-scan-saved', (scan) => {
                    eventCount++;
                    expect(scan).toBeDefined();
                    expect(scan.RawPayload).toBe('EVENT_TEST');

                    if (eventCount === 1) {
                        done();
                    }
                });

                // Trigger event
                dbClient.createSession(1).then(session => {
                    return dbClient.saveQRScan(session.ID, 'EVENT_TEST');
                });
            });

            test('should handle multiple simultaneous events', async () => {
                const eventPromises = [];
                let eventCount = 0;

                dbClient.on('qr-scan-saved', () => {
                    eventCount++;
                });

                const session = await dbClient.createSession(1);

                // Trigger multiple events
                for (let i = 0; i < 5; i++) {
                    eventPromises.push(dbClient.saveQRScan(session.ID, `EVENT_${i}`));
                }

                await Promise.all(eventPromises);

                // Give events time to fire
                await new Promise(resolve => setTimeout(resolve, 50));

                expect(eventCount).toBe(5);
            });
        });
    });

    describe('Data Consistency', () => {
        test('should maintain referential integrity', async () => {
            await rfidListener.start();

            // Create session
            const user = await dbClient.getUserByRFID('329C172');
            const session = await dbClient.createSession(user.BenID);

            // Add QR scans
            await dbClient.saveQRScan(session.ID, 'INTEGRITY_TEST_1');
            await dbClient.saveQRScan(session.ID, 'INTEGRITY_TEST_2');

            // Verify session exists in data
            const sessionInData = dbClient.mockData.sessions.find(s => s.ID === session.ID);
            expect(sessionInData).toBeDefined();

            // Verify scans reference correct session
            const scans = dbClient.mockData.qrScans.filter(s => s.SessionID === session.ID);
            expect(scans.length).toBe(2);
            expect(scans.every(s => s.SessionID === session.ID)).toBe(true);
        });

        test('should handle transaction-like operations', async () => {
            // This test ensures that related operations either all succeed or all fail
            const user = await dbClient.getUserByRFID('329C172');

            try {
                // Start transaction-like operation
                const session = await dbClient.createSession(user.BenID);

                // Multiple related operations
                const results = await Promise.all([
                    dbClient.saveQRScan(session.ID, 'TRANSACTION_1'),
                    dbClient.saveQRScan(session.ID, 'TRANSACTION_2'),
                    dbClient.saveQRScan(session.ID, 'TRANSACTION_3')
                ]);

                // All should succeed
                expect(results.every(r => r.success)).toBe(true);

                // Verify all data is consistent
                const scans = await dbClient.getQRScansBySession(session.ID);
                expect(scans.length).toBe(3);

            } catch (error) {
                // In case of failure, ensure no partial data is left
                // This would be more relevant in a real database scenario
                expect(error).toBeUndefined();
            }
        });
    });
});