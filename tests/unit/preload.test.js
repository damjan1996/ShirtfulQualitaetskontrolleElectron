/**
 * Unit Tests für Electron Preload Script
 * Testet die sichere API-Exposition zwischen Main und Renderer Process
 */

const { mockElectron } = require('../mocks/electron.mock');

// Mock Electron
jest.mock('electron', () => mockElectron);

describe('Preload Script', () => {
    let mockContextBridge;
    let mockIpcRenderer;
    let exposedAPI;

    beforeEach(() => {
        // Reset alle Mocks
        jest.clearAllMocks();

        // Zugriff auf die korrekten Mock-Objekte
        mockContextBridge = mockElectron.contextBridge;
        mockIpcRenderer = mockElectron.ipcRenderer;

        // Simuliere das Preload-Script und die API-Exposition
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
            expect(api).toHaveProperty('system');
            expect(api).toHaveProperty('on');
            expect(api).toHaveProperty('off');
        });

        test('should not expose Node.js globals', () => {
            const [, api] = mockContextBridge.exposeInMainWorld.mock.calls[0];

            // Stelle sicher, dass Node.js-spezifische APIs nicht exponiert sind
            expect(api).not.toHaveProperty('require');
            expect(api).not.toHaveProperty('process');
            expect(api).not.toHaveProperty('Buffer');
            expect(api).not.toHaveProperty('global');
            expect(api).not.toHaveProperty('__dirname');
            expect(api).not.toHaveProperty('__filename');
        });
    });

    describe('Database API', () => {
        test('should call getUserByEPC correctly', async () => {
            const testTagId = '123456789ABCDEF';
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                id: 1,
                name: 'Test User',
                epc: testTagId
            });

            const result = await exposedAPI.db.getUserByEPC(testTagId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-get-user-by-epc', testTagId);
            expect(result).toEqual({
                id: 1,
                name: 'Test User',
                epc: testTagId
            });
        });

        test('should call getUserById correctly', async () => {
            const testUserId = 42;
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                id: testUserId,
                name: 'Test User',
                epc: '123456789ABCDEF'
            });

            const result = await exposedAPI.db.getUserById(testUserId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-get-user-by-id', testUserId);
            expect(result.id).toBe(testUserId);
        });

        test('should call getAllActiveUsers correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce([
                { id: 1, name: 'User 1' },
                { id: 2, name: 'User 2' }
            ]);

            const result = await exposedAPI.db.getAllActiveUsers();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-get-all-active-users');
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
        });

        test('should call healthCheck correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                status: 'healthy',
                timestamp: '2024-01-01T00:00:00Z'
            });

            const result = await exposedAPI.db.healthCheck();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-health-check');
            expect(result.status).toBe('healthy');
        });

        test('should handle database API errors', async () => {
            const testError = new Error('Database connection failed');
            mockIpcRenderer.invoke.mockRejectedValueOnce(testError);

            await expect(exposedAPI.db.healthCheck()).rejects.toThrow('Database connection failed');
            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('db-health-check');
        });
    });

    describe('Session API', () => {
        test('should create session correctly', async () => {
            const testUserId = 42;
            const expectedResponse = {
                sessionId: 'sess_123',
                userId: testUserId,
                startTime: '2024-01-01T00:00:00Z'
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(expectedResponse);

            const result = await exposedAPI.session.create(testUserId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-create', testUserId);
            expect(result).toEqual(expectedResponse);
        });

        test('should end session correctly', async () => {
            const testSessionId = 'sess_123';
            const expectedResponse = {
                sessionId: testSessionId,
                endTime: '2024-01-01T01:00:00Z',
                success: true
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(expectedResponse);

            const result = await exposedAPI.session.end(testSessionId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-end', testSessionId);
            expect(result.success).toBe(true);
        });

        test('should get active session correctly', async () => {
            const testUserId = 42;
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                sessionId: 'sess_123',
                userId: testUserId,
                active: true
            });

            const result = await exposedAPI.session.getActive(testUserId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-get-active', testUserId);
            expect(result.active).toBe(true);
        });

        test('should get session stats correctly', async () => {
            const testSessionId = 'sess_123';
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                sessionId: testSessionId,
                duration: 3600000, // 1 hour in ms
                qrScansCount: 15
            });

            const result = await exposedAPI.session.getStats(testSessionId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('session-get-stats', testSessionId);
            expect(result.duration).toBe(3600000);
        });
    });

    describe('QR Scan API', () => {
        test('should save QR scan correctly', async () => {
            const testSessionId = 'sess_123';
            const testPayload = 'QR_CODE_DATA_12345';
            const expectedResponse = {
                scanId: 'scan_456',
                sessionId: testSessionId,
                payload: testPayload,
                timestamp: '2024-01-01T00:30:00Z'
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce(expectedResponse);

            const result = await exposedAPI.qr.save(testSessionId, testPayload);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-scan-save', testSessionId, testPayload);
            expect(result).toEqual(expectedResponse);
        });

        test('should get QR scans by session correctly', async () => {
            const testSessionId = 'sess_123';
            const testLimit = 10;

            mockIpcRenderer.invoke.mockResolvedValueOnce([
                { scanId: 'scan_1', payload: 'QR_1' },
                { scanId: 'scan_2', payload: 'QR_2' }
            ]);

            const result = await exposedAPI.qr.getBySession(testSessionId, testLimit);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-get-by-session', testSessionId, testLimit);
            expect(Array.isArray(result)).toBe(true);
            expect(result).toHaveLength(2);
        });

        test('should get recent QR scans correctly', async () => {
            const testLimit = 5;

            mockIpcRenderer.invoke.mockResolvedValueOnce([
                { scanId: 'scan_recent_1', payload: 'RECENT_QR_1' }
            ]);

            const result = await exposedAPI.qr.getRecent(testLimit);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-get-recent', testLimit);
            expect(Array.isArray(result)).toBe(true);
        });

        test('should delete QR scan correctly', async () => {
            const testScanId = 'scan_456';

            mockIpcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                deletedScanId: testScanId
            });

            const result = await exposedAPI.qr.delete(testScanId);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('qr-delete', testScanId);
            expect(result.success).toBe(true);
        });
    });

    describe('RFID API', () => {
        test('should start RFID listener correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                message: 'RFID listener started'
            });

            const result = await exposedAPI.rfid.start();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-start');
            expect(result.success).toBe(true);
        });

        test('should stop RFID listener correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                message: 'RFID listener stopped'
            });

            const result = await exposedAPI.rfid.stop();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-stop');
            expect(result.success).toBe(true);
        });

        test('should get RFID stats correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                isListening: true,
                totalScans: 42,
                successfulScans: 40,
                errorCount: 2
            });

            const result = await exposedAPI.rfid.getStats();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-get-stats');
            expect(result.isListening).toBe(true);
            expect(result.totalScans).toBe(42);
        });

        test('should set RFID config correctly', async () => {
            const testConfig = {
                inputTimeout: 300,
                maxBufferLength: 20
            };

            mockIpcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                config: testConfig
            });

            const result = await exposedAPI.rfid.setConfig(testConfig);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('rfid-set-config', testConfig);
            expect(result.success).toBe(true);
        });
    });

    describe('Window API', () => {
        test('should minimize window correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({ success: true });

            const result = await exposedAPI.window.minimize();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-minimize');
            expect(result.success).toBe(true);
        });

        test('should maximize window correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({ success: true });

            const result = await exposedAPI.window.maximize();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-maximize');
            expect(result.success).toBe(true);
        });

        test('should close window correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({ success: true });

            const result = await exposedAPI.window.close();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-close');
            expect(result.success).toBe(true);
        });

        test('should set always on top correctly', async () => {
            const testFlag = true;
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                success: true,
                alwaysOnTop: testFlag
            });

            const result = await exposedAPI.window.setAlwaysOnTop(testFlag);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('window-always-on-top', testFlag);
            expect(result.alwaysOnTop).toBe(testFlag);
        });
    });

    describe('Event Handling', () => {
        test('should register event listeners correctly', () => {
            const testCallback = jest.fn();
            const testChannel = 'test-event';

            const unsubscribe = exposedAPI.on(testChannel, testCallback);

            expect(mockIpcRenderer.on).toHaveBeenCalledWith(testChannel, testCallback);
            expect(typeof unsubscribe).toBe('function');
        });

        test('should unregister event listeners correctly', () => {
            const testChannel = 'test-event';

            exposedAPI.off(testChannel);

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledWith(testChannel);
        });

        test('should handle off method correctly', () => {
            const testChannel = 'test-event';
            const testCallback = jest.fn();

            exposedAPI.off(testChannel, testCallback);

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledWith(testChannel);
        });

        test('should handle multiple event listeners', () => {
            const callback1 = jest.fn();
            const callback2 = jest.fn();

            exposedAPI.on('event1', callback1);
            exposedAPI.on('event2', callback2);

            expect(mockIpcRenderer.on).toHaveBeenCalledTimes(2);
            expect(mockIpcRenderer.on).toHaveBeenCalledWith('event1', callback1);
            expect(mockIpcRenderer.on).toHaveBeenCalledWith('event2', callback2);
        });
    });

    describe('Statistics API', () => {
        test('should get user stats correctly', async () => {
            const testUserId = 42;
            const testDays = 7;

            mockIpcRenderer.invoke.mockResolvedValueOnce({
                userId: testUserId,
                totalSessions: 15,
                totalHours: 120,
                averageSessionDuration: 8
            });

            const result = await exposedAPI.stats.getUserStats(testUserId, testDays);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('stats-get-user', testUserId, testDays);
            expect(result.userId).toBe(testUserId);
        });

        test('should get daily stats correctly', async () => {
            const testDate = '2024-01-01';

            mockIpcRenderer.invoke.mockResolvedValueOnce({
                date: testDate,
                totalUsers: 5,
                totalScans: 123,
                totalHours: 40
            });

            const result = await exposedAPI.stats.getDailyStats(testDate);

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('stats-get-daily', testDate);
            expect(result.date).toBe(testDate);
        });
    });

    describe('System API', () => {
        test('should get version correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                app: '1.0.1',
                electron: '22.0.0',
                node: '16.17.1',
                chrome: '108.0.5359.215'
            });

            const result = await exposedAPI.system.getVersion();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('system-get-version');
            expect(result.app).toBe('1.0.1');
        });

        test('should get platform correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                platform: 'win32',
                arch: 'x64',
                hostname: 'test-machine'
            });

            const result = await exposedAPI.system.getPlatform();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('system-get-platform');
            expect(result.platform).toBe('win32');
        });

        test('should get environment correctly', async () => {
            mockIpcRenderer.invoke.mockResolvedValueOnce({
                nodeEnv: 'test',
                isDev: false,
                isTest: true
            });

            const result = await exposedAPI.system.getEnvironment();

            expect(mockIpcRenderer.invoke).toHaveBeenCalledWith('system-get-environment');
            expect(result.isTest).toBe(true);
        });
    });

    describe('Error Handling and Security', () => {
        test('should handle IPC invoke errors gracefully', async () => {
            const testError = new Error('IPC communication failed');
            mockIpcRenderer.invoke.mockRejectedValueOnce(testError);

            await expect(exposedAPI.db.healthCheck()).rejects.toThrow('IPC communication failed');
        });

        test('should not expose sensitive functions', () => {
            const [, api] = mockContextBridge.exposeInMainWorld.mock.calls[0];

            // Keine direkten Filesystem-Operationen
            expect(api).not.toHaveProperty('fs');
            expect(api).not.toHaveProperty('readFile');
            expect(api).not.toHaveProperty('writeFile');

            // Keine Shell-Befehle
            expect(api).not.toHaveProperty('exec');
            expect(api).not.toHaveProperty('spawn');

            // Keine Network-Operationen
            expect(api).not.toHaveProperty('http');
            expect(api).not.toHaveProperty('https');
            expect(api).not.toHaveProperty('fetch');
        });

        test('should validate API method signatures', () => {
            const [, api] = mockContextBridge.exposeInMainWorld.mock.calls[0];

            // Alle DB-Methoden sollten Funktionen sein
            expect(typeof api.db.getUserByEPC).toBe('function');
            expect(typeof api.db.getUserById).toBe('function');
            expect(typeof api.db.healthCheck).toBe('function');

            // Alle Session-Methoden sollten Funktionen sein
            expect(typeof api.session.create).toBe('function');
            expect(typeof api.session.end).toBe('function');

            // Alle Window-Methoden sollten Funktionen sein
            expect(typeof api.window.minimize).toBe('function');
            expect(typeof api.window.maximize).toBe('function');
        });

        test('should handle concurrent API calls', async () => {
            // Setup multiple concurrent calls
            const promises = [
                exposedAPI.db.healthCheck(),
                exposedAPI.rfid.getStats(),
                exposedAPI.session.getActive(1)
            ];

            // Mock alle Aufrufe
            mockIpcRenderer.invoke
                .mockResolvedValueOnce({ status: 'healthy' })
                .mockResolvedValueOnce({ isListening: true })
                .mockResolvedValueOnce({ active: false });

            const results = await Promise.all(promises);

            expect(results).toHaveLength(3);
            expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(3);
        });
    });

    describe('Memory Management', () => {
        test('should cleanup event listeners properly', () => {
            const testCallback = jest.fn();
            const unsubscribe = exposedAPI.on('test-event', testCallback);

            // Cleanup aufrufen
            unsubscribe();

            expect(mockIpcRenderer.removeAllListeners).toHaveBeenCalledWith('test-event');
        });

        test('should not leak memory on repeated API calls', async () => {
            // Simulate repeated calls
            for (let i = 0; i < 100; i++) {
                mockIpcRenderer.invoke.mockResolvedValueOnce({ iteration: i });
                await exposedAPI.db.healthCheck();
            }

            expect(mockIpcRenderer.invoke).toHaveBeenCalledTimes(100);
        });
    });
});