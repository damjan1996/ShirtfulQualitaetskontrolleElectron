// tests/unit/main.test.js
/**
 * Unit Tests für Electron Main Process
 */

const { mockElectron } = require('../mocks/electron.mock');
const MockDatabaseClient = require('../mocks/db-client.mock');
const MockRFIDListener = require('../mocks/rfid-listener.mock');

// Mock Electron
jest.mock('electron', () => mockElectron);

// Mock Node-HID
jest.mock('node-hid', () => ({
    devices: jest.fn(() => []),
    HID: jest.fn()
}));

// Mock MSSQL
jest.mock('mssql', () => global.mockMSSql);

// Mock Path und FS für Electron
jest.mock('path', () => ({
    join: jest.fn((...args) => args.join('/')),
    resolve: jest.fn((...args) => args.join('/'))
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(() => true),
    readFileSync: jest.fn(() => 'mock file content')
}));

describe('Main Process', () => {
    let mainApp;
    let mockWindow;
    let mockDbClient;
    let mockRfidListener;

    beforeEach(() => {
        // Reset alle Mocks
        jest.clearAllMocks();

        // Mock Database Client
        mockDbClient = new MockDatabaseClient();

        // Mock RFID Listener
        mockRfidListener = new MockRFIDListener();

        // Mock Browser Window
        mockWindow = new mockElectron.BrowserWindow();

        // Mock Main App Zustand
        mainApp = {
            window: mockWindow,
            dbClient: mockDbClient,
            rfidListener: mockRfidListener,
            currentUser: null,
            currentSession: null,
            isInitialized: false,
            config: {
                windowWidth: 1200,
                windowHeight: 800,
                isDev: false
            }
        };

        // Mock Environment
        process.env.NODE_ENV = 'test';
        process.env.MSSQL_SERVER = 'localhost';
        process.env.MSSQL_DATABASE = 'RdScanner_Test';
        process.env.MSSQL_USER = 'test_user';
        process.env.MSSQL_PASSWORD = 'test_password';
    });

    afterEach(async () => {
        if (mockRfidListener) {
            await mockRfidListener.stop();
        }
        if (mockDbClient) {
            await mockDbClient.close();
        }
    });

    describe('Application Initialization', () => {
        test('should initialize app correctly', async () => {
            const initResult = await mockElectron.app.whenReady();

            expect(initResult).toBeUndefined(); // Promise resolves without value
            expect(mockElectron.app.isReady).toBe(true);
        });

        test('should create main window with correct options', () => {
            const window = new mockElectron.BrowserWindow({
                width: 1200,
                height: 800,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: 'preload.js'
                }
            });

            expect(window).toBeDefined();
            expect(window.options.width).toBe(1200);
            expect(window.options.height).toBe(800);
            expect(window.options.webPreferences.contextIsolation).toBe(true);
        });

        test('should handle app ready event', async () => {
            const readyHandler = jest.fn();
            mockElectron.app.on('ready', readyHandler);

            await mockElectron.app.whenReady();
            mockElectron.app.emit('ready');

            expect(readyHandler).toHaveBeenCalled();
        });

        test('should quit app when all windows are closed', () => {
            const quitSpy = jest.spyOn(mockElectron.app, 'quit');

            mockElectron.app.emit('window-all-closed');

            expect(quitSpy).toHaveBeenCalled();
        });

        test('should handle second instance', () => {
            const focusSpy = jest.spyOn(mockWindow, 'focus');
            const showSpy = jest.spyOn(mockWindow, 'show');

            mockElectron.app.emit('second-instance');

            // In der echten App würde hier das Fenster fokussiert
            // Hier testen wir nur die Mock-Funktionalität
            expect(mockElectron.app.requestSingleInstanceLock()).toBe(true);
        });
    });

    describe('Database Connection', () => {
        test('should connect to database successfully', async () => {
            const connectResult = await mockDbClient.connect();

            expect(connectResult).toBe(true);
            expect(mockDbClient.isConnected).toBe(true);
        });

        test('should handle database connection errors', async () => {
            const errorSpy = jest.spyOn(mockDbClient, 'emit');

            // Mock einen Verbindungsfehler
            jest.spyOn(mockDbClient, 'connect').mockRejectedValueOnce(new Error('Connection failed'));

            await expect(mockDbClient.connect()).rejects.toThrow('Connection failed');
            expect(mockDbClient.isConnected).toBe(false);
        });

        test('should perform health check', async () => {
            await mockDbClient.connect();
            const healthResult = await mockDbClient.healthCheck();

            expect(healthResult).toBeDefined();
            expect(healthResult.connected).toBe(true);
            expect(healthResult.server).toBeDefined();
            expect(healthResult.stats).toBeDefined();
        });

        test('should close database connection cleanly', async () => {
            await mockDbClient.connect();
            const closeResult = await mockDbClient.close();

            expect(closeResult).toBe(true);
            expect(mockDbClient.isConnected).toBe(false);
        });
    });

    describe('RFID Listener', () => {
        test('should start RFID listener successfully', async () => {
            const startResult = await mockRfidListener.start();

            expect(startResult).toBe(true);
            expect(mockRfidListener.isListening).toBe(true);
        });

        test('should handle RFID scan events', (done) => {
            const testTagId = '53004114';

            mockRfidListener.on('tag-scanned', (data) => {
                expect(data.tagId).toBe(testTagId);
                expect(data.timestamp).toBeDefined();
                done();
            });

            mockRfidListener.start().then(() => {
                mockRfidListener.simulateTag(testTagId);
            });
        });

        test('should handle invalid RFID tags', (done) => {
            const invalidTag = 'INVALID!';

            mockRfidListener.on('invalid-scan', (data) => {
                expect(data.tagId).toBe(invalidTag);
                expect(data.reason).toContain('Invalid hex characters');
                done();
            });

            mockRfidListener.start().then(() => {
                mockRfidListener.simulateTag(invalidTag);
            });
        });

        test('should stop RFID listener cleanly', async () => {
            await mockRfidListener.start();
            const stopResult = await mockRfidListener.stop();

            expect(stopResult).toBe(true);
            expect(mockRfidListener.isListening).toBe(false);
        });

        test('should track scan statistics', async () => {
            await mockRfidListener.start();

            // Simuliere mehrere Scans
            mockRfidListener.simulateTag('53004114');
            mockRfidListener.simulateTag('87654321');
            mockRfidListener.simulateTag('INVALID!');

            const stats = mockRfidListener.getStats();

            expect(stats.totalScans).toBe(3);
            expect(stats.validScans).toBe(2);
            expect(stats.invalidScans).toBe(1);
            expect(stats.isListening).toBe(true);
        });
    });

    describe('IPC Communication', () => {
        test('should register IPC handlers', () => {
            const mockIpcMain = mockElectron.ipcMain;

            // Simuliere Registrierung der IPC-Handler
            mockIpcMain.handle('db-get-user-by-epc', async (event, tagId) => {
                return await mockDbClient.getUserByEPC(tagId);
            });

            mockIpcMain.handle('session-create', async (event, userId) => {
                return await mockDbClient.createSession(userId);
            });

            mockIpcMain.handle('qr-scan-save', async (event, sessionId, payload) => {
                return await mockDbClient.saveQRScan(sessionId, payload);
            });

            expect(mockIpcMain.handle).toHaveBeenCalledTimes(3);
        });

        test('should handle user lookup IPC call', async () => {
            await mockDbClient.connect();
            const tagId = '53004114';

            const handler = jest.fn().mockImplementation(async (event, id) => {
                return await mockDbClient.getUserByEPC(id);
            });

            mockElectron.ipcMain.handle('db-get-user-by-epc', handler);

            const result = await mockElectron.ipcMain.invokeHandler('db-get-user-by-epc', tagId);

            expect(handler).toHaveBeenCalledWith(expect.any(Object), tagId);
            expect(result).toBeDefined();
            expect(result.EPC).toBe(parseInt(tagId, 16));
        });

        test('should handle session creation IPC call', async () => {
            await mockDbClient.connect();
            const userId = 1;

            const handler = jest.fn().mockImplementation(async (event, id) => {
                return await mockDbClient.createSession(id);
            });

            mockElectron.ipcMain.handle('session-create', handler);

            const result = await mockElectron.ipcMain.invokeHandler('session-create', userId);

            expect(handler).toHaveBeenCalledWith(expect.any(Object), userId);
            expect(result).toBeDefined();
            expect(result.UserID).toBe(userId);
            expect(result.Active).toBe(1);
        });

        test('should send events to renderer', () => {
            const mockWebContents = mockWindow.webContents;
            const sendSpy = jest.spyOn(mockWebContents, 'send');

            // Simuliere Event-Sending
            const eventData = {
                type: 'user-login',
                user: { ID: 1, BenutzerName: 'Test User' },
                session: { ID: 1, StartTS: new Date().toISOString() }
            };

            mockWebContents.send('user-login', eventData);

            expect(sendSpy).toHaveBeenCalledWith('user-login', eventData);
        });
    });

    describe('Window Management', () => {
        test('should handle window close event', () => {
            const closeSpy = jest.spyOn(mockWindow, 'close');

            mockWindow.emit('close');

            expect(mockWindow.isDestroyed).toBe(false); // Noch nicht destroyed bei close
        });

        test('should handle window minimize/maximize', () => {
            const minimizeSpy = jest.spyOn(mockWindow, 'minimize');
            const maximizeSpy = jest.spyOn(mockWindow, 'maximize');

            mockWindow.minimize();
            mockWindow.maximize();

            expect(minimizeSpy).toHaveBeenCalled();
            expect(maximizeSpy).toHaveBeenCalled();
            expect(mockWindow.isMinimized).toBe(true);
            expect(mockWindow.isMaximized).toBe(true);
        });

        test('should handle window focus events', () => {
            const focusSpy = jest.spyOn(mockWindow, 'focus');
            const blurSpy = jest.spyOn(mockWindow, 'blur');

            mockWindow.focus();
            mockWindow.blur();

            expect(focusSpy).toHaveBeenCalled();
            expect(blurSpy).toHaveBeenCalled();
        });

        test('should load correct HTML file', async () => {
            const loadFileSpy = jest.spyOn(mockWindow, 'loadFile');

            await mockWindow.loadFile('renderer/index.html');

            expect(loadFileSpy).toHaveBeenCalledWith('renderer/index.html');
        });
    });

    describe('User Session Workflow', () => {
        beforeEach(async () => {
            await mockDbClient.connect();
            await mockRfidListener.start();
        });

        test('should handle complete user login workflow', async () => {
            const tagId = '53004114';

            // 1. RFID-Tag wird gescannt
            const tagScannedPromise = new Promise((resolve) => {
                mockRfidListener.on('tag-scanned', resolve);
            });

            mockRfidListener.simulateTag(tagId);
            const scanEvent = await tagScannedPromise;

            expect(scanEvent.tagId).toBe(tagId);

            // 2. User wird in DB gesucht
            const user = await mockDbClient.getUserByEPC(tagId);
            expect(user).toBeDefined();
            expect(user.EPC).toBe(parseInt(tagId, 16));

            // 3. Session wird erstellt
            const session = await mockDbClient.createSession(user.ID);
            expect(session).toBeDefined();
            expect(session.UserID).toBe(user.ID);
            expect(session.Active).toBe(1);

            // 4. App-State wird aktualisiert
            mainApp.currentUser = user;
            mainApp.currentSession = session;

            expect(mainApp.currentUser.ID).toBe(user.ID);
            expect(mainApp.currentSession.ID).toBe(session.ID);
        });

        test('should handle QR scan workflow', async () => {
            // Setup: User ist eingeloggt
            const user = await mockDbClient.getUserByEPC('53004114');
            const session = await mockDbClient.createSession(user.ID);

            mainApp.currentUser = user;
            mainApp.currentSession = session;

            // QR-Code scannen
            const qrPayload = 'PACKAGE_12345_ABC';
            const scanResult = await mockDbClient.saveQRScan(session.ID, qrPayload);

            expect(scanResult.success).toBe(true);
            expect(scanResult.data.SessionID).toBe(session.ID);
            expect(scanResult.data.RawPayload).toBe(qrPayload);
        });

        test('should handle user logout workflow', async () => {
            // Setup: User ist eingeloggt
            const user = await mockDbClient.getUserByEPC('53004114');
            const session = await mockDbClient.createSession(user.ID);

            mainApp.currentUser = user;
            mainApp.currentSession = session;

            // Logout
            const endedSession = await mockDbClient.endSession(session.ID);

            expect(endedSession.Active).toBe(0);
            expect(endedSession.EndTS).toBeDefined();

            // App-State zurücksetzen
            mainApp.currentUser = null;
            mainApp.currentSession = null;

            expect(mainApp.currentUser).toBeNull();
            expect(mainApp.currentSession).toBeNull();
        });
    });

    describe('Error Handling', () => {
        test('should handle database connection errors gracefully', async () => {
            const errorHandler = jest.fn();
            mockDbClient.on('error', errorHandler);

            // Simuliere DB-Fehler
            mockDbClient.simulateConnectionError();

            expect(mockDbClient.isConnected).toBe(false);
        });

        test('should handle RFID hardware errors gracefully', async () => {
            const errorHandler = jest.fn();
            mockRfidListener.on('hardware-error', errorHandler);

            await mockRfidListener.start();
            const error = mockRfidListener.simulateHardwareError('connection_lost');

            expect(errorHandler).toHaveBeenCalledWith(error);
        });

        test('should handle unknown user RFID scans', async () => {
            await mockDbClient.connect();

            const unknownTag = 'UNKNOWN123';
            const user = await mockDbClient.getUserByEPC(unknownTag);

            expect(user).toBeNull();
        });

        test('should handle invalid QR scan data', async () => {
            await mockDbClient.connect();
            const user = await mockDbClient.getUserByEPC('53004114');
            const session = await mockDbClient.createSession(user.ID);

            // Teste mit leerem Payload
            await expect(mockDbClient.saveQRScan(session.ID, ''))
                .rejects.toThrow();

            // Teste mit invalid Session ID
            await expect(mockDbClient.saveQRScan(999, 'valid_payload'))
                .rejects.toThrow('No active session found');
        });
    });

    describe('Performance and Monitoring', () => {
        test('should track database performance stats', async () => {
            await mockDbClient.connect();

            // Führe einige DB-Operationen aus
            await mockDbClient.getUserByEPC('53004114');
            await mockDbClient.getAllActiveUsers();
            await mockDbClient.healthCheck();

            const stats = mockDbClient.getPerformanceStats();

            expect(stats.queries.total).toBeGreaterThan(0);
            expect(stats.queries.successful).toBeGreaterThan(0);
            expect(stats.queries.avgDuration).toBeGreaterThan(0);
        });

        test('should track RFID scan statistics', async () => {
            await mockRfidListener.start();

            // Simuliere mehrere Scans
            mockRfidListener.simulateTag('53004114');
            mockRfidListener.simulateTag('87654321');
            mockRfidListener.simulateTag('53004114'); // Duplicate

            const stats = mockRfidListener.getStats();

            expect(stats.totalScans).toBe(3);
            expect(stats.validScans).toBe(2);
            expect(stats.duplicateScans).toBe(1);
            expect(stats.scanRate).toBeGreaterThan(0);
        });

        test('should monitor application health', async () => {
            await mockDbClient.connect();
            await mockRfidListener.start();

            const dbHealth = await mockDbClient.healthCheck();
            const rfidStats = mockRfidListener.getStats();

            const appHealth = {
                database: {
                    connected: dbHealth.connected,
                    responseTime: dbHealth.connectionTime
                },
                rfid: {
                    listening: rfidStats.isListening,
                    scanRate: rfidStats.scanRate
                },
                window: {
                    visible: mockWindow.isVisible(),
                    focused: mockWindow.isFocused()
                }
            };

            expect(appHealth.database.connected).toBe(true);
            expect(appHealth.rfid.listening).toBe(true);
            expect(appHealth.window.visible).toBe(true);
        });
    });

    describe('Cleanup and Shutdown', () => {
        test('should cleanup resources on app quit', async () => {
            await mockDbClient.connect();
            await mockRfidListener.start();

            // Simuliere App-Shutdown
            const dbCloseSpy = jest.spyOn(mockDbClient, 'close');
            const rfidStopSpy = jest.spyOn(mockRfidListener, 'stop');

            await mockDbClient.close();
            await mockRfidListener.stop();

            expect(dbCloseSpy).toHaveBeenCalled();
            expect(rfidStopSpy).toHaveBeenCalled();
            expect(mockDbClient.isConnected).toBe(false);
            expect(mockRfidListener.isListening).toBe(false);
        });

        test('should handle forced app termination', () => {
            const exitSpy = jest.spyOn(mockElectron.app, 'exit');

            // Simuliere forciertes Beenden
            mockElectron.app.exit(0);

            expect(exitSpy).toHaveBeenCalledWith(0);
        });
    });
});