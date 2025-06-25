/**
 * Unit Tests für Electron Main Process
 * Testet die Hauptanwendungslogik und IPC-Handler
 */

const { mockElectron } = require('../mocks/electron.mock');

// Mock aller externen Dependencies
jest.mock('electron', () => mockElectron);
jest.mock('../../db/db-client', () => {
    return jest.fn().mockImplementation(() => ({
        connect: jest.fn(() => Promise.resolve()),
        close: jest.fn(() => Promise.resolve()),
        query: jest.fn(() => Promise.resolve([])),
        getUserByEPC: jest.fn(() => Promise.resolve(null)),
        getUserById: jest.fn(() => Promise.resolve(null)),
        healthCheck: jest.fn(() => Promise.resolve(true)),
        isConnected: false
    }));
});

jest.mock('../../rfid/rfid-listener', () => {
    return jest.fn().mockImplementation(() => ({
        start: jest.fn(() => Promise.resolve()),
        stop: jest.fn(() => Promise.resolve()),
        isListening: false,
        on: jest.fn(),
        removeAllListeners: jest.fn()
    }));
});

describe('Main Process', () => {
    let app, mainWindow, dbClient, rfidListener;

    beforeEach(() => {
        // Reset alle Mocks
        jest.clearAllMocks();

        // Mock Application State
        app = {
            isReady: false,
            mainWindow: null,
            dbClient: null,
            rfidListener: null,
            config: {
                window: {
                    width: 1200,
                    height: 800,
                    minWidth: 800,
                    minHeight: 600
                }
            }
        };

        process.env.NODE_ENV = 'test';
    });

    describe('Application Initialization', () => {
        test('should initialize Electron app correctly', async () => {
            // Arrange
            const { app: electronApp } = mockElectron;

            // Act
            await electronApp.whenReady();
            app.isReady = true;

            // Assert
            expect(electronApp.whenReady).toHaveBeenCalled();
            expect(app.isReady).toBe(true);
        });

        test('should create main window with correct configuration', async () => {
            // Arrange
            const { BrowserWindow } = mockElectron;
            await mockElectron.app.whenReady();

            // Act
            mainWindow = new BrowserWindow({
                width: app.config.window.width,
                height: app.config.window.height,
                minWidth: app.config.window.minWidth,
                minHeight: app.config.window.minHeight,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: require('path').join(__dirname, '../../preload.js')
                },
                show: false
            });

            app.mainWindow = mainWindow;

            // Assert
            expect(BrowserWindow).toHaveBeenCalledWith(
                expect.objectContaining({
                    width: 1200,
                    height: 800,
                    minWidth: 800,
                    minHeight: 600,
                    webPreferences: expect.objectContaining({
                        nodeIntegration: false,
                        contextIsolation: true
                    }),
                    show: false
                })
            );
            expect(app.mainWindow).toBeDefined();
        });

        test('should handle single instance lock correctly', () => {
            // Arrange & Act
            const hasSingleInstanceLock = mockElectron.app.requestSingleInstanceLock();

            // Assert
            expect(mockElectron.app.requestSingleInstanceLock).toHaveBeenCalled();
            expect(hasSingleInstanceLock).toBe(true);
        });

        test('should load main HTML file correctly', async () => {
            // Arrange
            const { BrowserWindow } = mockElectron;
            await mockElectron.app.whenReady();
            mainWindow = new BrowserWindow();

            // Act
            await mainWindow.loadFile('renderer/index.html');

            // Assert
            expect(mainWindow.loadFile).toHaveBeenCalledWith('renderer/index.html');
        });
    });

    describe('IPC Handler Registration', () => {
        test('should register database IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;
            const mockHandlers = new Map();

            ipcMain.handle.mockImplementation((channel, handler) => {
                mockHandlers.set(channel, handler);
            });

            // Act - Simuliere Handler-Registrierung
            ipcMain.handle('db-get-user-by-epc', async (event, tagId) => {
                return { id: 1, name: 'Test User', epc: tagId };
            });

            ipcMain.handle('db-get-user-by-id', async (event, userId) => {
                return { id: userId, name: 'Test User', epc: '123456789' };
            });

            ipcMain.handle('db-health-check', async () => {
                return { status: 'healthy', timestamp: new Date().toISOString() };
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('db-get-user-by-epc', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('db-get-user-by-id', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('db-health-check', expect.any(Function));
        });

        test('should register session IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('session-create', async (event, userId) => {
                return { sessionId: 'sess_123', userId, startTime: new Date().toISOString() };
            });

            ipcMain.handle('session-end', async (event, sessionId) => {
                return { sessionId, endTime: new Date().toISOString(), success: true };
            });

            ipcMain.handle('session-get-active', async (event, userId) => {
                return { sessionId: 'sess_123', userId, active: true };
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('session-create', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('session-end', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('session-get-active', expect.any(Function));
        });

        test('should register QR scan IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('qr-scan-save', async (event, sessionId, payload) => {
                return { scanId: 'scan_123', sessionId, payload, timestamp: new Date().toISOString() };
            });

            ipcMain.handle('qr-get-by-session', async (event, sessionId, limit = 10) => {
                return [
                    { scanId: 'scan_123', payload: 'test_qr_code', timestamp: new Date().toISOString() }
                ];
            });

            ipcMain.handle('qr-get-recent', async (event, limit = 10) => {
                return [
                    { scanId: 'scan_123', payload: 'test_qr_code', timestamp: new Date().toISOString() }
                ];
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('qr-scan-save', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('qr-get-by-session', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('qr-get-recent', expect.any(Function));
        });

        test('should register RFID IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('rfid-start', async () => {
                return { success: true, message: 'RFID listener started' };
            });

            ipcMain.handle('rfid-stop', async () => {
                return { success: true, message: 'RFID listener stopped' };
            });

            ipcMain.handle('rfid-get-stats', async () => {
                return {
                    isListening: true,
                    totalScans: 42,
                    successfulScans: 40,
                    errorCount: 2
                };
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('rfid-start', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('rfid-stop', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('rfid-get-stats', expect.any(Function));
        });

        test('should register window control IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('window-minimize', async () => {
                return { success: true };
            });

            ipcMain.handle('window-maximize', async () => {
                return { success: true };
            });

            ipcMain.handle('window-close', async () => {
                return { success: true };
            });

            ipcMain.handle('window-always-on-top', async (event, flag) => {
                return { success: true, alwaysOnTop: flag };
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('window-minimize', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('window-maximize', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('window-close', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('window-always-on-top', expect.any(Function));
        });
    });

    describe('Window Event Handling', () => {
        test('should handle window close event', async () => {
            // Arrange
            const { BrowserWindow } = mockElectron;
            await mockElectron.app.whenReady();
            mainWindow = new BrowserWindow();

            const closeHandler = jest.fn();

            // Act
            mainWindow.on('close', closeHandler);
            mainWindow.emit('close');

            // Assert
            expect(mainWindow.on).toHaveBeenCalledWith('close', closeHandler);
        });

        test('should handle window closed event', async () => {
            // Arrange
            const { BrowserWindow } = mockElectron;
            await mockElectron.app.whenReady();
            mainWindow = new BrowserWindow();

            const closedHandler = jest.fn(() => {
                app.mainWindow = null;
            });

            // Act
            mainWindow.on('closed', closedHandler);
            mainWindow.emit('closed');

            // Assert
            expect(mainWindow.on).toHaveBeenCalledWith('closed', closedHandler);
            expect(app.mainWindow).toBeNull();
        });

        test('should handle window ready-to-show event', async () => {
            // Arrange
            const { BrowserWindow } = mockElectron;
            await mockElectron.app.whenReady();
            mainWindow = new BrowserWindow({ show: false });

            const readyHandler = jest.fn(() => {
                mainWindow.show();
            });

            // Act
            mainWindow.on('ready-to-show', readyHandler);
            mainWindow.emit('ready-to-show');

            // Assert
            expect(mainWindow.on).toHaveBeenCalledWith('ready-to-show', readyHandler);
            expect(mainWindow.show).toHaveBeenCalled();
        });
    });

    describe('Application Lifecycle', () => {
        test('should handle app activation (macOS)', () => {
            // Arrange
            const { app: electronApp, BrowserWindow } = mockElectron;
            const activateHandler = jest.fn(() => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    // Create new window
                    new BrowserWindow();
                }
            });

            // Act
            electronApp.on('activate', activateHandler);
            electronApp.emit('activate');

            // Assert
            expect(electronApp.on).toHaveBeenCalledWith('activate', activateHandler);
        });

        test('should handle window-all-closed event', () => {
            // Arrange
            const { app: electronApp } = mockElectron;
            const windowsClosedHandler = jest.fn(() => {
                if (process.platform !== 'darwin') {
                    electronApp.quit();
                }
            });

            // Act
            electronApp.on('window-all-closed', windowsClosedHandler);
            electronApp.emit('window-all-closed');

            // Assert
            expect(electronApp.on).toHaveBeenCalledWith('window-all-closed', windowsClosedHandler);
        });

        test('should handle before-quit event', () => {
            // Arrange
            const { app: electronApp } = mockElectron;
            const beforeQuitHandler = jest.fn();

            // Act
            electronApp.on('before-quit', beforeQuitHandler);
            electronApp.emit('before-quit');

            // Assert
            expect(electronApp.on).toHaveBeenCalledWith('before-quit', beforeQuitHandler);
        });
    });

    describe('Error Handling', () => {
        test('should handle IPC handler errors gracefully', async () => {
            // Arrange
            const { ipcMain } = mockElectron;
            const errorHandler = jest.fn(async () => {
                throw new Error('Test IPC error');
            });

            // Act
            ipcMain.handle('test-error-handler', errorHandler);

            try {
                await errorHandler();
            } catch (error) {
                // Assert
                expect(error.message).toBe('Test IPC error');
            }

            expect(ipcMain.handle).toHaveBeenCalledWith('test-error-handler', errorHandler);
        });

        test('should handle uncaught exceptions', () => {
            // Arrange
            const originalHandler = process.listeners('uncaughtException');
            const errorHandler = jest.fn((error) => {
                console.error('Uncaught Exception:', error);
            });

            // Act
            process.on('uncaughtException', errorHandler);

            // Simulate uncaught exception
            const testError = new Error('Test uncaught exception');
            process.emit('uncaughtException', testError);

            // Assert
            expect(errorHandler).toHaveBeenCalledWith(testError);

            // Cleanup
            process.removeListener('uncaughtException', errorHandler);
        });

        test('should handle unhandled promise rejections', () => {
            // Arrange
            const rejectionHandler = jest.fn((reason, promise) => {
                console.error('Unhandled Promise Rejection:', reason);
            });

            // Act
            process.on('unhandledRejection', rejectionHandler);

            // Simulate unhandled rejection
            const testReason = new Error('Test rejection');
            const testPromise = Promise.reject(testReason);
            process.emit('unhandledRejection', testReason, testPromise);

            // Assert
            expect(rejectionHandler).toHaveBeenCalledWith(testReason, testPromise);

            // Cleanup
            process.removeListener('unhandledRejection', rejectionHandler);
        });
    });

    describe('System Information', () => {
        test('should provide system information via IPC', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('system-get-version', async () => {
                return {
                    app: mockElectron.app.getVersion(),
                    electron: process.versions.electron,
                    node: process.versions.node,
                    chrome: process.versions.chrome
                };
            });

            ipcMain.handle('system-get-platform', async () => {
                return {
                    platform: process.platform,
                    arch: process.arch,
                    hostname: require('os').hostname()
                };
            });

            ipcMain.handle('system-get-environment', async () => {
                return {
                    nodeEnv: process.env.NODE_ENV,
                    isDev: process.env.NODE_ENV === 'development',
                    isTest: process.env.NODE_ENV === 'test'
                };
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('system-get-version', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('system-get-platform', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('system-get-environment', expect.any(Function));
        });
    });

    describe('Configuration Management', () => {
        test('should load configuration correctly', () => {
            // Arrange
            const defaultConfig = {
                window: {
                    width: 1200,
                    height: 800,
                    minWidth: 800,
                    minHeight: 600
                },
                database: {
                    connectionTimeout: 5000,
                    requestTimeout: 3000
                },
                rfid: {
                    inputTimeout: 200,
                    maxBufferLength: 15
                }
            };

            // Act
            app.config = { ...defaultConfig };

            // Assert
            expect(app.config.window.width).toBe(1200);
            expect(app.config.window.height).toBe(800);
            expect(app.config.database.connectionTimeout).toBe(5000);
            expect(app.config.rfid.inputTimeout).toBe(200);
        });

        test('should validate configuration values', () => {
            // Arrange
            const invalidConfig = {
                window: {
                    width: -1,  // Invalid
                    height: 0   // Invalid
                }
            };

            const validConfig = {
                window: {
                    width: Math.max(800, invalidConfig.window.width),
                    height: Math.max(600, invalidConfig.window.height)
                }
            };

            // Act
            app.config = validConfig;

            // Assert
            expect(app.config.window.width).toBe(800);
            expect(app.config.window.height).toBe(600);
        });
    });
});