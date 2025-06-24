const MockRFIDListener = require('../mocks/rfid-listener.mock');
const MockDBClient = require('../mocks/db-client.mock');

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

        // Mock Main Process Setup
        mockMainProcess = {
            ipcHandlers: new Map(),
            webContents: {
                send: jest.fn()
            }
        };

        // Setup Mock Main App
        mockMainApp = {
            handleRFIDScan: jest.fn(),
            handleDatabaseError: jest.fn(),
            handleSessionCreate: jest.fn(),
            handleSessionEnd: jest.fn(),
            isRunning: true,

            // Simuliere Main App Methoden
            async getUserByEPC(epc) {
                return await dbClient.getUserByEPC(epc);
            },

            async createSession(userId) {
                return await dbClient.createSession(userId);
            },

            async endSession(sessionId) {
                return await dbClient.endSession(sessionId);
            }
        };

        // Neue Instanzen für jeden Test
        rfidListener = new MockRFIDListener();
        rfidListener.updateConfig({ debugMode: false });
        rfidListener.disableHardwareError();

        dbClient = new MockDBClient();
        await dbClient.connect();

        // Event-Verbindungen setup
        rfidListener.on('tag-scanned', (tagId) => {
            mockMainApp.handleRFIDScan(tagId);
        });

        rfidListener.on('error', (error) => {
            mockMainApp.handleDatabaseError(error);
        });
    });

    afterEach(async () => {
        // Cleanup
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.stop();
        }

        if (dbClient && dbClient.isConnected) {
            await dbClient.disconnect();
        }

        // Event-Listener entfernen
        if (rfidListener) {
            rfidListener.removeAllListeners();
        }

        // Mock cleanup
        if (global.mockElectron) {
            global.mockElectron.globalShortcut.unregisterAll();
            global.mockElectron.ipcMain.removeAllListeners();
        }
    });

    describe('Basic Integration', () => {
        test('should start both RFID listener and database connection', async () => {
            await rfidListener.start();

            expect(rfidListener.isRunning).toBe(true);
            expect(dbClient.isConnected).toBe(true);
            expect(mockMainApp.isRunning).toBe(true);
        });

        test('should handle RFID scan and database lookup', async () => {
            await rfidListener.start();

            const tagId = '53004114';
            const mockUser = { id: 1, name: 'Test User', epc: tagId };

            // Setup Database Mock
            dbClient.setMockUser(tagId, mockUser);

            // Simuliere RFID-Scan
            rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // Teste Database-Lookup
            const user = await mockMainApp.getUserByEPC(tagId);
            expect(user).toEqual(mockUser);
        });

        test('should create session after successful user lookup', async () => {
            await rfidListener.start();

            const tagId = '53004114';
            const mockUser = { id: 1, name: 'Test User', epc: tagId };
            const mockSession = { id: 101, userId: 1, startTime: new Date(), active: true };

            dbClient.setMockUser(tagId, mockUser);
            dbClient.setMockSession(1, mockSession);

            // Simuliere RFID-Scan
            rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            // Teste Session-Erstellung
            const session = await mockMainApp.createSession(mockUser.id);
            expect(session).toEqual(mockSession);
        });

        test('should handle unknown RFID tags', async () => {
            await rfidListener.start();

            const unknownTagId = '99999999';

            // Simuliere RFID-Scan mit unbekanntem Tag
            rfidListener.simulateTag(unknownTagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(unknownTagId);

            // Database-Lookup sollte null zurückgeben
            const user = await mockMainApp.getUserByEPC(unknownTagId);
            expect(user).toBeNull();
        });
    });

    describe('Error Recovery Integration', () => {
        test('should handle database disconnection during scan', async () => {
            await rfidListener.start();

            const tagId = '53004114';

            // Simuliere Datenbankverbindung unterbrechen
            await dbClient.simulateDisconnection();

            // RFID-Scan sollte weiterhin funktionieren
            rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // DB-Operation schlägt fehl
            await expect(dbClient.getUserByEPC(tagId)).rejects.toThrow();

            // Verbindung wiederherstellen
            await dbClient.reconnect();

            // Sollte wieder funktionieren
            const mockUser = { id: 1, name: 'Test User', epc: tagId };
            dbClient.setMockUser(tagId, mockUser);

            const user = await dbClient.getUserByEPC(tagId);
            expect(user).toEqual(mockUser);
        });

        test('should handle RFID listener restart', async () => {
            await rfidListener.start();

            const tagId = '53004114';

            // Stoppe RFID-Listener
            await rfidListener.stop();
            expect(rfidListener.isRunning).toBe(false);

            // Neustarten
            await rfidListener.start();
            expect(rfidListener.isRunning).toBe(true);

            // Scan sollte wieder funktionieren
            rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);
        });

        test('should handle database timeout errors', async () => {
            await rfidListener.start();

            const tagId = '53004114';

            // Simuliere Database-Timeout
            dbClient.simulateTimeout(true);

            // Database-Operation sollte timeout
            await expect(dbClient.getUserByEPC(tagId)).rejects.toThrow('Database operation timed out');

            // Timeout zurücksetzen
            dbClient.simulateTimeout(false);

            // Sollte wieder normal funktionieren
            const mockUser = { id: 1, name: 'Test User', epc: tagId };
            dbClient.setMockUser(tagId, mockUser);

            const user = await dbClient.getUserByEPC(tagId);
            expect(user).toEqual(mockUser);
        });
    });

    describe('Performance Integration', () => {
        test('should handle rapid RFID tag switches', async () => {
            await rfidListener.start();

            const tags = [
                { id: '53004114', user: { id: 1, name: 'User 1', epc: '53004114' } },
                { id: '53004115', user: { id: 2, name: 'User 2', epc: '53004115' } },
                { id: '53004116', user: { id: 3, name: 'User 3', epc: '53004116' } }
            ];

            // Setup Mock-User
            tags.forEach(tag => {
                dbClient.setMockUser(tag.id, tag.user);
            });

            // Simuliere schnelle Tag-Wechsel
            for (const tag of tags) {
                rfidListener.simulateTag(tag.id);
                await new Promise(resolve => setTimeout(resolve, 25)); // Kurze Pause
            }

            // Alle Scans sollten verarbeitet worden sein
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(tags.length);

            // Database-Lookups sollten alle erfolgreich sein
            for (const tag of tags) {
                const user = await mockMainApp.getUserByEPC(tag.id);
                expect(user).toEqual(tag.user);
            }
        });

        test('should handle concurrent database operations', async () => {
            await rfidListener.start();

            const tagId = '53004114';
            const mockUser = { id: 1, name: 'Test User', epc: tagId };

            dbClient.setMockUser(tagId, mockUser);

            // Simuliere mehrere parallele Database-Operationen
            const operations = [
                mockMainApp.getUserByEPC(tagId),
                mockMainApp.getUserByEPC(tagId),
                mockMainApp.getUserByEPC(tagId)
            ];

            const results = await Promise.all(operations);

            // Alle Operationen sollten erfolgreich sein
            results.forEach(result => {
                expect(result).toEqual(mockUser);
            });
        });

        test('should maintain statistics during integration stress test', async () => {
            await rfidListener.start();

            const tagIds = Array(20).fill().map((_, i) => `530041${i.toString().padStart(2, '0')}`);

            // Setup Mock-User für alle Tags
            tagIds.forEach((tagId, index) => {
                const mockUser = { id: index + 1, name: `User ${index + 1}`, epc: tagId };
                dbClient.setMockUser(tagId, mockUser);
            });

            // Simuliere viele Scans
            for (const tagId of tagIds) {
                rfidListener.simulateTag(tagId);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Statistiken prüfen
            expect(rfidListener.stats.totalScans).toBe(tagIds.length);
            expect(rfidListener.stats.validScans).toBe(tagIds.length);
            expect(rfidListener.stats.invalidScans).toBe(0);
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(tagIds.length);
        });
    });

    describe('Frontend-Backend Integration', () => {
        let mockRenderer;

        beforeEach(() => {
            mockRenderer = {
                sendMessage: jest.fn(),
                receiveMessage: jest.fn()
            };

            // Mock electron IPC
            global.mockElectron.ipcMain.handle('user-lookup', async (epc) => {
                return await dbClient.getUserByEPC(epc);
            });

            global.mockElectron.ipcMain.handle('session-create', async (userId) => {
                return await dbClient.createSession(userId);
            });

            global.mockElectron.ipcMain.handle('session-end', async (sessionId) => {
                return await dbClient.endSession(sessionId);
            });
        });

        describe('IPC Communication', () => {
            test('should handle user lookup via IPC', async () => {
                const tagId = '53004114';
                const mockUser = { id: 1, name: 'Test User', epc: tagId };

                dbClient.setMockUser(tagId, mockUser);

                // Simuliere Frontend-Request via IPC
                const result = await global.mockElectron.ipcMain.invoke('user-lookup', tagId);

                expect(result).toEqual(mockUser);
            });

            test('should handle session creation via IPC', async () => {
                const userId = 1;
                const mockSession = { id: 101, userId: userId, startTime: new Date(), active: true };

                dbClient.setMockSession(userId, mockSession);

                // Simuliere Frontend-Request via IPC
                const result = await global.mockElectron.ipcMain.invoke('session-create', userId);

                expect(result).toEqual(mockSession);
            });

            test('should handle session ending via IPC', async () => {
                const sessionId = 101;
                const mockSession = { id: sessionId, userId: 1, startTime: new Date(), endTime: new Date(), active: false };

                dbClient.setMockEndSession(sessionId, mockSession);

                // Simuliere Frontend-Request via IPC
                const result = await global.mockElectron.ipcMain.invoke('session-end', sessionId);

                expect(result).toEqual(mockSession);
            });
        });

        test('should handle RFID scan with complete workflow', async () => {
            await rfidListener.start();

            const tagId = '53004114';
            const mockUser = { id: 1, name: 'Test User', epc: tagId };
            const mockSession = { id: 101, userId: 1, startTime: new Date(), active: true };

            // Setup Mocks
            dbClient.setMockUser(tagId, mockUser);
            dbClient.setMockSession(1, mockSession);

            // Simuliere kompletten Workflow
            rfidListener.simulateTag(tagId);
            await new Promise(resolve => setTimeout(resolve, 50));

            // RFID-Scan wurde erkannt
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(tagId);

            // User-Lookup via IPC
            const user = await global.mockElectron.ipcMain.invoke('user-lookup', tagId);
            expect(user).toEqual(mockUser);

            // Session-Erstellung via IPC
            const session = await global.mockElectron.ipcMain.invoke('session-create', user.id);
            expect(session).toEqual(mockSession);
        });
    });

    describe('Edge Cases Integration', () => {
        test('should handle invalid database responses', async () => {
            await rfidListener.start();

            const tagId = '53004114';

            // Simuliere ungültige Database-Response
            dbClient.setMockUser(tagId, { invalid: 'response' });

            const user = await dbClient.getUserByEPC(tagId);
            expect(user.invalid).toBe('response');
        });

        test('should handle RFID listener errors during database operations', async () => {
            // RFID-Fehler aktivieren
            rfidListener.enableHardwareError();

            // Start sollte fehlschlagen
            await expect(rfidListener.start()).rejects.toThrow('Hardware initialization failed');

            // Database sollte weiterhin funktionieren
            expect(dbClient.isConnected).toBe(true);
        });

        test('should handle mixed valid and invalid tags', async () => {
            await rfidListener.start();

            const validTag = '53004114';
            const invalidTag = 'INVALID!';
            const mockUser = { id: 1, name: 'Test User', epc: validTag };

            dbClient.setMockUser(validTag, mockUser);

            // Simuliere mixed Tags
            rfidListener.simulateTag(validTag);
            await new Promise(resolve => setTimeout(resolve, 25));

            rfidListener.simulateTag(invalidTag);
            await new Promise(resolve => setTimeout(resolve, 25));

            rfidListener.simulateTag(validTag);
            await new Promise(resolve => setTimeout(resolve, 25));

            // Statistiken prüfen
            expect(rfidListener.stats.totalScans).toBe(3);
            expect(rfidListener.stats.validScans).toBe(2);
            expect(rfidListener.stats.invalidScans).toBe(1);

            // Nur gültige Tags sollten an Main App weitergegeben werden
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledTimes(2);
            expect(mockMainApp.handleRFIDScan).toHaveBeenCalledWith(validTag);
        });
    });
});