// tests/integrations/rfid-database-integration.test.js
/**
 * RFID-Database Integration Tests
 * Testet die Zusammenarbeit zwischen RFID Listener und Database Client
 */

const MockRFIDListener = require('../mocks/rfid-listener.mock');
const MockDatabaseClient = require('../mocks/db-client.mock');

describe('RFID-Database Integration', () => {
    let rfidListener;
    let dbClient;
    let mockMainApp;
    let mockMainProcess;

    beforeEach(async () => {
        // Setup vollständiger Electron-Mock
        global.mockElectron = {
            globalShortcut: {
                shortcuts: new Map(),
                register: jest.fn((shortcut, callback) => {
                    if (global.mockElectron.globalShortcut.shortcuts.has(shortcut)) {
                        return false;
                    }
                    global.mockElectron.globalShortcut.shortcuts.set(shortcut, callback);
                    return true;
                }),
                unregister: jest.fn((shortcut) => {
                    return global.mockElectron.globalShortcut.shortcuts.delete(shortcut);
                }),
                unregisterAll: jest.fn(() => {
                    global.mockElectron.globalShortcut.shortcuts.clear();
                }),
                triggerShortcut: (shortcut) => {
                    const callback = global.mockElectron.globalShortcut.shortcuts.get(shortcut);
                    if (callback) {
                        callback();
                    }
                }
            },
            ipcMain: {
                handlers: new Map(),
                handle: jest.fn((channel, handler) => {
                    global.mockElectron.ipcMain.handlers.set(channel, handler);
                }),
                off: jest.fn((channel) => {
                    global.mockElectron.ipcMain.handlers.delete(channel);
                }),
                emit: jest.fn(),
                removeAllListeners: jest.fn(() => {
                    global.mockElectron.ipcMain.handlers.clear();
                }),
                // Simuliere IPC-Aufruf
                invoke: async (channel, ...args) => {
                    const handler = global.mockElectron.ipcMain.handlers.get(channel);
                    if (handler) {
                        return await handler(...args);
                    }
                    throw new Error(`No handler for channel: ${channel}`);
                }
            },
            webContents: {
                send: jest.fn()
            }
        };

        // Mock Main App mit korrekten Event Handlers
        mockMainApp = {
            handleRFIDScan: jest.fn(),
            handleInvalidScan: jest.fn(),
            handleRFIDError: jest.fn(),
            handleDatabaseError: jest.fn()
        };

        // Mock Main Process
        mockMainProcess = {
            ipcHandlers: new Map(),
            registerIpcHandlers: function() {
                // User lookup handler
                global.mockElectron.ipcMain.handle('user-lookup', async (tagId) => {
                    try {
                        return await dbClient.getUserByEPC(tagId);
                    } catch (error) {
                        throw error;
                    }
                });

                // Session creation handler
                global.mockElectron.ipcMain.handle('session-create', async (userId) => {
                    try {
                        return await dbClient.createSession(userId);
                    } catch (error) {
                        throw error;
                    }
                });
            }
        };

        // Setup Database Client
        dbClient = new MockDatabaseClient();
        await dbClient.connect();

        // Setup RFID Listener mit deaktivierten Hardware-Fehlern
        rfidListener = new MockRFIDListener();
        rfidListener.disableHardwareError();

        // Event Handler verbinden
        rfidListener.on('tag-detected', (data) => {
            mockMainApp.handleRFIDScan(data.tagId);
        });

        rfidListener.on('invalid-scan', (data) => {
            mockMainApp.handleInvalidScan(data.tagId, data.reason);
        });

        rfidListener.on('error', (error) => {
            mockMainApp.handleRFIDError(error);
        });

        // RFID Listener starten
        await rfidListener.start();

        // IPC Handlers registrieren
        mockMainProcess.registerIpcHandlers();
    });

    afterEach(async () => {
        // Cleanup in korrekter Reihenfolge
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.stop();
        }
        if (dbClient && dbClient.isConnected) {
            await dbClient.close();
        }

        // Event listeners cleanen
        if (rfidListener) {
            rfidListener.removeAllListeners();
        }

        // Electron Mock cleanup
        if (global.mockElectron) {
            global.mockElectron.globalShortcut.unregisterAll();
            global.mockElectron.ipcMain.removeAllListeners();
        }

        // Jest mocks resetten
        jest.clearAllMocks();
    });

    describe('Basic Integration', () => {
        test('should handle valid RFID tag with database lookup', async () => {
            const tagId = '53004114';
            const mockUser = {
                ID: 1,
                BenutzerName: 'Test User 1',
                EPC: tagId
            };

            // Mock User in Database
            dbClient.setMockUser(tagId, mockUser);

            // Simuliere RFID Scan
            await rfidListener.simulateTag(tagId);

            // Warte auf Verarbeitung
            await new Promise(resolve => setTimeout(resolve, 50));

            // Prüfe Event Handling
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);
            expect(mockMainApp.handleInvalidScan).not.toHaveBeenCalled();

            // Prüfe Database Lookup über IPC
            const user = await global.mockElectron.ipcMain.invoke('user-lookup', tagId);
            expect(user).toEqual(mockUser);
        });

        test('should handle invalid RFID tag', async () => {
            const invalidTag = 'INVALID!';

            // Simuliere ungültigen RFID Scan
            await rfidListener.simulateTag(invalidTag);

            // Warte auf Verarbeitung
            await new Promise(resolve => setTimeout(resolve, 50));

            // Prüfe Event Handling
            expect(mockMainApp.handleInvalidScan).toHaveBeenCalledWith(
                invalidTag,
                'Invalid hex characters'
            );
            expect(mockMainApp.handleRFIDScan).not.toHaveBeenCalled();
        });

        test('should handle database errors gracefully', async () => {
            const tagId = '53004114';

            // Simuliere Database Error
            dbClient.simulateError(new Error('Database connection failed'));

            // Simuliere RFID Scan
            await rfidListener.simulateTag(tagId);

            // Warte auf Verarbeitung
            await new Promise(resolve => setTimeout(resolve, 50));

            // RFID Event sollte trotzdem gefeuert werden
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // Database Lookup sollte fehlschlagen
            await expect(
                global.mockElectron.ipcMain.invoke('user-lookup', tagId)
            ).rejects.toThrow('Database connection failed');
        });
    });

    describe('Session Management Integration', () => {
        test('should create session after successful login', async () => {
            const tagId = '53004114';
            const mockUser = {
                ID: 1,
                BenutzerName: 'Test User 1',
                EPC: tagId
            };

            dbClient.setMockUser(tagId, mockUser);

            // Simuliere Login-Workflow
            await rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            // User lookup
            const user = await global.mockElectron.ipcMain.invoke('user-lookup', tagId);
            expect(user).toEqual(mockUser);

            // Session erstellen
            const session = await global.mockElectron.ipcMain.invoke('session-create', user.ID);
            expect(session).toBeDefined();
            expect(session.BenID).toBe(user.ID);
            expect(session.Active).toBe(1);
        });

        test('should handle multiple user sessions', async () => {
            const user1Tag = '53004114';
            const user2Tag = '53004115';

            const mockUser1 = { ID: 1, BenutzerName: 'User 1', EPC: user1Tag };
            const mockUser2 = { ID: 2, BenutzerName: 'User 2', EPC: user2Tag };

            dbClient.setMockUser(user1Tag, mockUser1);
            dbClient.setMockUser(user2Tag, mockUser2);

            // User 1 Login
            await rfidListener.simulateTag(user1Tag);
            await new Promise(resolve => setTimeout(resolve, 50));

            const user1 = await global.mockElectron.ipcMain.invoke('user-lookup', user1Tag);
            const session1 = await global.mockElectron.ipcMain.invoke('session-create', user1.ID);

            // User 2 Login
            await rfidListener.simulateTag(user2Tag);
            await new Promise(resolve => setTimeout(resolve, 50));

            const user2 = await global.mockElectron.ipcMain.invoke('user-lookup', user2Tag);
            const session2 = await global.mockElectron.ipcMain.invoke('session-create', user2.ID);

            // Beide Sessions sollten aktiv sein
            expect(session1.Active).toBe(1);
            expect(session2.Active).toBe(1);
            expect(session1.ID).not.toBe(session2.ID);
        });
    });

    describe('Error Recovery Integration', () => {
        test('should handle database disconnection during scan', async () => {
            const tagId = '53004114';

            // Database disconnection simulieren
            await dbClient.close();

            // RFID-Scan sollte weiterhin funktionieren
            await rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // DB-Operation schlägt fehl
            await expect(
                global.mockElectron.ipcMain.invoke('user-lookup', tagId)
            ).rejects.toThrow();
        });

        test('should handle RFID listener restart', async () => {
            const tagId = '53004114';

            // Listener stoppen und neu starten
            await rfidListener.stop();
            await rfidListener.start();

            // Scan sollte wieder funktionieren
            await rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);
        });
    });

    describe('Performance Integration', () => {
        test('should handle rapid RFID tag switches', async () => {
            const tags = ['53004114', '53004115', '53004116'];
            const users = tags.map((tag, index) => ({
                ID: index + 1,
                BenutzerName: `User ${index + 1}`,
                EPC: tag
            }));

            // Mock Users setzen
            users.forEach(user => {
                dbClient.setMockUser(user.EPC, user);
            });

            // Rapid scanning simulieren
            const promises = tags.map((tag, index) =>
                rfidListener.simulateTag(tag, index * 10)
            );

            await Promise.all(promises);
            await new Promise(resolve => setTimeout(resolve, 100));

            // Alle Tags sollten verarbeitet worden sein
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(3);
            tags.forEach(tag => {
                expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tag);
            });
        });

        test('should maintain performance under load', async () => {
            const tagId = '53004114';
            const mockUser = { ID: 1, BenutzerName: 'Test User', EPC: tagId };
            dbClient.setMockUser(tagId, mockUser);

            const startTime = Date.now();
            const scanCount = 100;

            // Rapid scanning
            const promises = Array(scanCount).fill().map((_, i) =>
                rfidListener.simulateTag(tagId, i * 2)
            );

            await Promise.all(promises);
            await new Promise(resolve => setTimeout(resolve, 200));

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Performance assertions
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(scanCount);
            expect(duration).toBeLessThan(1000); // Should complete within 1 second
        });
    });

    describe('Statistics Integration', () => {
        test('should track integrated statistics', async () => {
            const validTag = '53004114';
            const invalidTag = 'INVALID!';
            const mockUser = { id: 1, name: 'Test User', epc: validTag };

            dbClient.setMockUser(validTag, mockUser);

            // Simuliere mixed Tags
            await rfidListener.simulateTag(validTag);
            await new Promise(resolve => setTimeout(resolve, 25));

            await rfidListener.simulateTag(invalidTag);
            await new Promise(resolve => setTimeout(resolve, 25));

            await rfidListener.simulateTag(validTag);
            await new Promise(resolve => setTimeout(resolve, 25));

            // Statistiken prüfen
            const stats = rfidListener.getStats();
            expect(stats.totalScans).toBe(3);
            expect(stats.validScans).toBe(2);
            expect(stats.invalidScans).toBe(1);
            expect(stats.successRate).toBe(67); // 2/3 * 100

            // Nur gültige Tags sollten an Main App weitergegeben werden
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(2);
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(validTag);
        });
    });

    describe('Frontend-Backend Integration', () => {
        beforeEach(() => {
            // Mock electron IPC für Frontend-Tests
            global.mockElectron.ipcMain.handle('user-lookup', async (tagId) => {
                return await dbClient.getUserByEPC(tagId);
            });

            global.mockElectron.ipcMain.handle('session-create', async (userId) => {
                return await dbClient.createSession(userId);
            });
        });

        describe('IPC Communication', () => {
            test('should handle user lookup via IPC', async () => {
                const tagId = '53004114';
                const mockUser = {
                    ID: 1,
                    BenutzerName: 'Test User',
                    EPC: tagId
                };

                dbClient.setMockUser(tagId, mockUser);

                // Simuliere Frontend-Aufruf
                const result = await global.mockElectron.ipcMain.invoke('user-lookup', tagId);

                expect(result).toEqual(mockUser);
            });

            test('should handle session creation via IPC', async () => {
                const userId = 1;

                // Simuliere Frontend-Aufruf
                const session = await global.mockElectron.ipcMain.invoke('session-create', userId);

                expect(session).toBeDefined();
                expect(session.BenID).toBe(userId);
                expect(session.Active).toBe(1);
            });
        });
    });
});