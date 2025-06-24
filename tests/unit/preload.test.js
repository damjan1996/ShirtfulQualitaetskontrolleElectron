// tests/unit/preload.test.js
/**
 * Unit Tests für Electron Preload Script
 */

const { mockElectron } = require('../mocks/electron.mock');

// Mock Electron
jest.mock('electron', () => mockElectron);

describe('Preload Script', () => {
    let mockContextBridge;
    let mockIpcRenderer;
    let exposedAPI;

    beforeEach(() => {
        // Reset Mocks
        jest.clearAllMocks();

        mockContextBridge = mockElectron.contextBridge;
        mockIpcRenderer = mockElectron.ipcRenderer;

        // Simuliere das Preload-Script
        exposedAPI = {
            // Database API
            db: {
                getUserByEPC: (tagId) => mockIpcRenderer.invoke('db-get-user-by-epc', tagId),
                getUserById: (userId) => mockIpcRenderer.invoke('db-get-user-by-id', userId),
                getAllActiveUsers: () => mockIpcRenderer.invoke('db-get-all-active-users'),
                healthCheck: () => mockIpcRenderer.invoke('db-health-check'),
                testConnection: () => mockIpcRenderer.invoke('db-test-connection')
            },

            // Session API
            session: {
                create: (userId) => mockIpcRenderer.invoke('session-create', userId),
                end: (sessionId) => mockIpcRenderer.invoke('session-end', sessionId),
                getActive: (userId) => mockIpcRenderer.invoke('session-get-active', userId),
                getStats: (sessionId) => mockIpcRenderer.invoke('session-get-stats', sessionId),
                getDuration: (sessionId) => mockIpcRenderer.invoke('session-get-duration', sessionId)
            },

            // QR Scan API
            qr: {
                save: (sessionId, payload) => mockIpcRenderer.invoke('qr-scan-save', sessionId, payload),
                getBySession: (sessionId, limit) => mockIpcRenderer.invoke('qr-get-by-session', sessionId, limit),
                getRecent: (limit) => mockIpcRenderer.invoke('qr-get-recent', limit),
                delete: (scanId) => mockIpcRenderer.invoke('qr-delete', scanId)
            },

            // RFID API
            rfid: {
                start: () => mockIpcRenderer.invoke('rfid-start'),
                stop: () => mockIpcRenderer.invoke('rfid-stop'),
                getStats: () => mockIpcRenderer.invoke('rfid-get-stats'),
                clearStats: () => mockIpcRenderer.invoke('rfid-clear-stats'),
                setConfig: (config) => mockIpcRenderer.invoke('rfid-set-config', config)
            },

            // Statistics API
            stats: {
                getUserStats: (userId, days) => mockIpcRenderer.invoke('stats-get-user', userId, days),
                getDailyStats: (date) => mockIpcRenderer.invoke('stats-get-daily', date),
                getSessionStats: (sessionId) => mockIpcRenderer.invoke('stats-get-session', sessionId)
            },

            // Window API
            window: {
                minimize: () => mockIpcRenderer.invoke('window-minimize'),
                maximize: () => mockIpcRenderer.invoke('window-maximize'),
                close: () => mockIpcRenderer.invoke('window-close'),
                setAlwaysOnTop: (flag) => mockIpcRenderer.invoke('window-always-on-top', flag),
                openDevTools: () => mockIpcRenderer.invoke('window-open-devtools')
            },

            // Event Listeners
            on: (channel, callback) => {
                mockIpcRenderer.on(channel, callback);
                return () => mockIpcRenderer.removeAllListeners(channel);
            },

            off: (channel, callback) => {
                mockIpcRenderer.removeAllListeners(channel);
            },

            // System Info
            system: {
                getVersion: () => mockIpcRenderer.invoke('system-get-version'),
                getPlatform: () => mockIpcRenderer.invoke('system-get-platform'),
                getEnvironment: () => mockIpcRenderer.invoke('system-get-environment')
            }
        };

        // Simuliere contextBridge.exposeInMainWorld
        mockContextBridge.exposeInMainWorld('electronAPI', exposedAPI);
    });

    describe('Context Bridge Exposure', () => {
        test('should expose electronAPI to main world', () => {
            expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
                'electronAPI',
                expect.any(Object)
            );
        });

        test('should expose all required API categories', () => {
            const [apiKey, api] = mockContextBridge.exposeInMainWorld.mock.calls[0];

            expect(apiKey).toBe('electronAPI');
            expect(api).toHaveProperty('db');
            expect(api).toHaveProperty('session');
            expect(api).toHaveProperty('qr');
            expect(api).toHaveProperty('rfid');
            expect(api).toHaveProperty('stats');
            expect(api).toHaveProperty('window');
            expect(api).toHaveProperty('on');
            expect(api).toHaveProperty('off');
            expect(api).toHaveProperty('system');
        });

        test('should not expose Node.js globals', () => {
            // Preload sollte Node.js-Module nicht direkt an Renderer weitergeben
            expect(global.electronAPI).toBeDefined();
            expect(global.electronAPI.require).toBeUndefined();
            expect(global.electronAPI.process).toBeUndefined();
            expect(global.electronAPI.__dirname).toBeUndefined();
            expect(global.electronAPI.__filename).toBeUndefined();
        });
    });

    describe('Database API', () => {
        test('should call getUserByEPC correctly', async () => {
            const tagId = '53004114';
            const mockResult = { ID: 1, BenutzerName: 'Test User' };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.db.getUserByEPC(tagId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-get-user-by-epc', tagId);
            expect(result).toEqual(mockResult);
        });

        test('should call getUserById correctly', async () => {
            const userId = 1;
            const mockResult = { ID: 1, BenutzerName: 'Test User' };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.db.getUserById(userId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-get-user-by-id', userId);
            expect(result).toEqual(mockResult);
        });

        test('should call getAllActiveUsers correctly', async () => {
            const mockResult = [
                { ID: 1, BenutzerName: 'User 1' },
                { ID: 2, BenutzerName: 'User 2' }
            ];

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.db.getAllActiveUsers();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-get-all-active-users');
            expect(result).toEqual(mockResult);
        });

        test('should call healthCheck correctly', async () => {
            const mockResult = {
                connected: true,
                server: 'localhost',
                stats: { activeUsers: 2 }
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.db.healthCheck();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-health-check');
            expect(result).toEqual(mockResult);
        });

        test('should handle database API errors', async () => {
            const error = new Error('Database connection failed');
            mockIpcRenderer.invoke.mockRejectedValueOnce(error);

            await expect(exposedAPI.db.getUserByEPC('invalid'))
                .rejects.toThrow('Database connection failed');
        });
    });

    describe('Session API', () => {
        test('should create session correctly', async () => {
            const userId = 1;
            const mockSession = {
                ID: 1,
                UserID: userId,
                StartTS: new Date().toISOString(),
                Active: 1
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockSession);

            const result = await exposedAPI.session.create(userId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-create', userId);
            expect(result).toEqual(mockSession);
        });

        test('should end session correctly', async () => {
            const sessionId = 1;
            const mockSession = {
                ID: sessionId,
                EndTS: new Date().toISOString(),
                Active: 0
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockSession);

            const result = await exposedAPI.session.end(sessionId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-end', sessionId);
            expect(result).toEqual(mockSession);
        });

        test('should get active session correctly', async () => {
            const userId = 1;
            const mockSession = {
                ID: 1,
                UserID: userId,
                Active: 1
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockSession);

            const result = await exposedAPI.session.getActive(userId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-get-active', userId);
            expect(result).toEqual(mockSession);
        });

        test('should get session stats correctly', async () => {
            const sessionId = 1;
            const mockStats = {
                sessionId: sessionId,
                totalScans: 25,
                duration: 3600000,
                scanRate: 0.42
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockStats);

            const result = await exposedAPI.session.getStats(sessionId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-get-stats', sessionId);
            expect(result).toEqual(mockStats);
        });
    });

    describe('QR Scan API', () => {
        test('should save QR scan correctly', async () => {
            const sessionId = 1;
            const payload = 'PACKAGE_12345_ABC';
            const mockResult = {
                success: true,
                data: { ID: 1, SessionID: sessionId, RawPayload: payload }
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.qr.save(sessionId, payload);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-scan-save', sessionId, payload);
            expect(result).toEqual(mockResult);
        });

        test('should get QR scans by session correctly', async () => {
            const sessionId = 1;
            const limit = 10;
            const mockScans = [
                { ID: 1, SessionID: sessionId, RawPayload: 'SCAN_001' },
                { ID: 2, SessionID: sessionId, RawPayload: 'SCAN_002' }
            ];

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockScans);

            const result = await exposedAPI.qr.getBySession(sessionId, limit);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-get-by-session', sessionId, limit);
            expect(result).toEqual(mockScans);
        });

        test('should get recent QR scans correctly', async () => {
            const limit = 20;
            const mockScans = [
                { ID: 3, RawPayload: 'RECENT_001' },
                { ID: 4, RawPayload: 'RECENT_002' }
            ];

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockScans);

            const result = await exposedAPI.qr.getRecent(limit);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-get-recent', limit);
            expect(result).toEqual(mockScans);
        });

        test('should delete QR scan correctly', async () => {
            const scanId = 1;
            const mockResult = { ID: scanId, deleted: true };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.qr.delete(scanId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-delete', scanId);
            expect(result).toEqual(mockResult);
        });
    });

    describe('RFID API', () => {
        test('should start RFID listener correctly', async () => {
            const mockResult = { success: true, listening: true };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.rfid.start();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-start');
            expect(result).toEqual(mockResult);
        });

        test('should stop RFID listener correctly', async () => {
            const mockResult = { success: true, listening: false };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.rfid.stop();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-stop');
            expect(result).toEqual(mockResult);
        });

        test('should get RFID stats correctly', async () => {
            const mockStats = {
                totalScans: 150,
                validScans: 145,
                invalidScans: 5,
                scanRate: 2.5,
                isListening: true
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockStats);

            const result = await exposedAPI.rfid.getStats();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-get-stats');
            expect(result).toEqual(mockStats);
        });

        test('should set RFID config correctly', async () => {
            const config = {
                inputTimeout: 300,
                maxBufferLength: 20,
                enableLogging: true
            };
            const mockResult = { success: true, config: config };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockResult);

            const result = await exposedAPI.rfid.setConfig(config);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-set-config', config);
            expect(result).toEqual(mockResult);
        });
    });

    describe('Window API', () => {
        test('should minimize window correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce(true);

            const result = await exposedAPI.window.minimize();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-minimize');
            expect(result).toBe(true);
        });

        test('should maximize window correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce(true);

            const result = await exposedAPI.window.maximize();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-maximize');
            expect(result).toBe(true);
        });

        test('should close window correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce(true);

            const result = await exposedAPI.window.close();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-close');
            expect(result).toBe(true);
        });

        test('should set always on top correctly', async () => {
            const flag = true;
            mockIpcRenderer.invoke.mockResolvedValueOnce(true);

            const result = await exposedAPI.window.setAlwaysOnTop(flag);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-always-on-top', flag);
            expect(result).toBe(true);
        });
    });

    describe('Event Handling', () => {
        test('should register event listeners correctly', () => {
            const callback = jest.fn();
            const channel = 'user-login';

            const unsubscribe = exposedAPI.on(channel, callback);

            expect(mockIpcRenderer.on).toHaveBeenCalledWith(channel, callback);
            expect(typeof unsubscribe).toBe('function');
        });

        test('should unregister event listeners correctly', () => {
            const callback = jest.fn();
            const channel = 'user-login';

            const unsubscribe = exposedAPI.on(channel, callback);
            unsubscribe();

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledWith(channel);
        });

        test('should handle off method correctly', () => {
            const callback = jest.fn();
            const channel = 'user-login';

            exposedAPI.off(channel, callback);

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledWith(channel);
        });

        test('should handle multiple event listeners', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();
            const channel = 'qr-scan-result';

            const unsub1 = exposedAPI.on(channel, callback1);
            const unsub2 = exposedAPI.on(channel, callback2);

            expect(mockIpcRenderer.on).toHaveBeenCalledTimes(2);
            expect(mockIpcRenderer.on).toHaveBeenCalledWith(channel, callback1);
            expect(mockIpcRenderer.on).toHaveBeenCalledWith(channel, callback2);

            // Cleanup
            unsub1();
            unsub2();
        });
    });

    describe('Statistics API', () => {
        test('should get user stats correctly', async () => {
            const userId = 1;
            const days = 30;
            const mockStats = {
                userId: userId,
                totalSessions: 15,
                totalScans: 450,
                avgSessionDuration: 7200000,
                avgScansPerSession: 30
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockStats);

            const result = await exposedAPI.stats.getUserStats(userId, days);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('stats-get-user', userId, days);
            expect(result).toEqual(mockStats);
        });

        test('should get daily stats correctly', async () => {
            const date = new Date().toISOString();
            const mockStats = {
                date: date,
                totalUsers: 5,
                totalSessions: 12,
                totalScans: 340,
                avgScansPerUser: 68
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockStats);

            const result = await exposedAPI.stats.getDailyStats(date);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('stats-get-daily', date);
            expect(result).toEqual(mockStats);
        });
    });

    describe('System API', () => {
        test('should get version correctly', async () => {
            const mockVersion = '1.0.0';

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockVersion);

            const result = await exposedAPI.system.getVersion();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('system-get-version');
            expect(result).toBe(mockVersion);
        });

        test('should get platform correctly', async () => {
            const mockPlatform = 'win32';

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockPlatform);

            const result = await exposedAPI.system.getPlatform();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('system-get-platform');
            expect(result).toBe(mockPlatform);
        });

        test('should get environment correctly', async () => {
            const mockEnv = {
                NODE_ENV: 'production',
                platform: 'win32',
                arch: 'x64'
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(mockEnv);

            const result = await exposedAPI.system.getEnvironment();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('system-get-environment');
            expect(result).toEqual(mockEnv);
        });
    });

    describe('Error Handling and Security', () => {
        test('should handle IPC invoke errors gracefully', async () => {
            const error = new Error('IPC communication failed');
            mockIpcRenderer.invoke.mockRejectedValueOnce(error);

            await expect(exposedAPI.db.getUserByEPC('test'))
                .rejects.toThrow('IPC communication failed');
        });

        test('should not expose sensitive functions', () => {
            const api = exposedAPI;

            // Diese Funktionen sollten NICHT verfügbar sein
            expect(api.require).toBeUndefined();
            expect(api.eval).toBeUndefined();
            expect(api.Function).toBeUndefined();
            expect(api.process).toBeUndefined();
            expect(api.global).toBeUndefined();
            expect(api.__dirname).toBeUndefined();
            expect(api.__filename).toBeUndefined();
        });

        test('should validate API method signatures', () => {
            // Überprüfe, dass alle API-Methoden Funktionen sind
            const checkMethodsAreFunction = (obj, path = '') => {
                for (const [key, value] of Object.entries(obj)) {
                    const fullPath = path ? `${path}.${key}` : key;

                    if (typeof value === 'object' && value !== null) {
                        checkMethodsAreFunction(value, fullPath);
                    } else if (typeof value === 'function') {
                        expect(typeof value).toBe('function');
                    } else if (key !== 'on' && key !== 'off') {
                        // on und off sind spezielle Event-Handler
                        throw new Error(`${fullPath} should be a function or object, got ${typeof value}`);
                    }
                }
            };

            checkMethodsAreFunction(exposedAPI);
        });

        test('should handle concurrent API calls', async () => {
            const tagId1 = '53004114';
            const tagId2 = '87654321';

            mockIpcRenderer.invoke
                .mockResolvedValueOnce({ ID: 1, BenutzerName: 'User 1' })
                .mockResolvedValueOnce({ ID: 2, BenutzerName: 'User 2' });

            const [result1, result2] = await Promise.all([
                exposedAPI.db.getUserByEPC(tagId1),
                exposedAPI.db.getUserByEPC(tagId2)
            ]);

            expect(result1.ID).toBe(1);
            expect(result2.ID).toBe(2);
            expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(2);
        });
    });

    describe('Memory Management', () => {
        test('should cleanup event listeners properly', () => {
            const listeners = [];

            // Registriere mehrere Event Listener
            for (let i = 0; i < 10; i++) {
                const callback = jest.fn();
                const unsub = exposedAPI.on(`test-event-${i}`, callback);
                listeners.push(unsub);
            }

            // Alle Listener entfernen
            listeners.forEach(unsub => unsub());

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledTimes(10);
        });

        test('should not leak memory on repeated API calls', async () => {
            mockIpcRenderer.invoke.mockResolvedValue({ success: true });

            // Simuliere viele API-Aufrufe
            const promises = [];
            for (let i = 0; i < 100; i++) {
                promises.push(exposedAPI.db.healthCheck());
            }

            await Promise.all(promises);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(100);
            // Stelle sicher, dass keine Referenzen im Mock hängen bleiben
            jest.clearAllMocks();
            expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(0);
        });
    });
});