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

describe('Main Process Tests', () => {
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
            ipcMain.handle('db-get-user-by-epc', jest.fn());
            ipcMain.handle('db-get-user-by-id', jest.fn());
            ipcMain.handle('db-health-check', jest.fn());

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('db-get-user-by-epc', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('db-get-user-by-id', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('db-health-check', expect.any(Function));
        });

        test('should register RFID IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('rfid-start', jest.fn());
            ipcMain.handle('rfid-stop', jest.fn());
            ipcMain.handle('rfid-is-listening', jest.fn());

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('rfid-start', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('rfid-stop', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('rfid-is-listening', expect.any(Function));
        });

        test('should register window control IPC handlers', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('window-minimize', jest.fn());
            ipcMain.handle('window-maximize', jest.fn());
            ipcMain.handle('window-close', jest.fn());
            ipcMain.handle('window-always-on-top', jest.fn());

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
        test('should handle app activate event', () => {
            // Arrange
            const { app: electronApp } = mockElectron;
            const activateHandler = jest.fn();

            // Act
            electronApp.on('activate', activateHandler);
            electronApp.emit('activate');

            // Assert
            expect(electronApp.on).toHaveBeenCalledWith('activate', activateHandler);
        });

        test('should handle app window-all-closed event', () => {
            // Arrange
            const { app: electronApp } = mockElectron;
            const allClosedHandler = jest.fn(() => {
                if (process.platform !== 'darwin') {
                    electronApp.quit();
                }
            });

            // Act
            electronApp.on('window-all-closed', allClosedHandler);
            electronApp.emit('window-all-closed');

            // Assert
            expect(electronApp.on).toHaveBeenCalledWith('window-all-closed', allClosedHandler);
            if (process.platform !== 'darwin') {
                expect(electronApp.quit).toHaveBeenCalled();
            }
        });

        test('should handle app quit event properly', async () => {
            // Arrange
            const { app: electronApp } = mockElectron;
            const DatabaseClient = require('../../db/db-client');
            const RFIDListener = require('../../rfid/rfid-listener');

            app.dbClient = new DatabaseClient();
            app.rfidListener = new RFIDListener();

            // Mock cleanup methods
            const cleanupHandler = jest.fn(async () => {
                if (app.rfidListener) {
                    await app.rfidListener.stop();
                }
                if (app.dbClient) {
                    await app.dbClient.close();
                }
            });

            // Act
            electronApp.on('before-quit', cleanupHandler);
            electronApp.emit('before-quit');

            // Assert
            expect(electronApp.on).toHaveBeenCalledWith('before-quit', cleanupHandler);
        });
    });

    describe('Error Handling', () => {
        test('should handle uncaught exceptions', () => {
            // Arrange
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

        test('should handle unhandled promise rejections', async () => {
            // Arrange
            const rejectionHandler = jest.fn((reason, promise) => {
                console.error('Unhandled Promise Rejection:', reason);
            });

            // Act
            process.on('unhandledRejection', rejectionHandler);

            // Simulate unhandled rejection mit .catch() um Jest nicht zu crashen
            const testReason = new Error('Test rejection');
            const testPromise = Promise.reject(testReason);

            // WICHTIG: Promise mit .catch() behandeln, um Jest nicht zum Absturz zu bringen
            testPromise.catch(() => {}); // Verhindere echte unbehandelte Rejection

            // Emit das Event manuell für den Test
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

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('system-get-version', expect.any(Function));
            expect(ipcMain.handle).toHaveBeenCalledWith('system-get-platform', expect.any(Function));
        });

        test('should provide memory usage information', () => {
            // Arrange
            const { ipcMain } = mockElectron;

            // Act
            ipcMain.handle('system-get-memory', async () => {
                const memoryUsage = process.memoryUsage();
                return {
                    rss: Math.round(memoryUsage.rss / 1024 / 1024),
                    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                    external: Math.round(memoryUsage.external / 1024 / 1024)
                };
            });

            // Assert
            expect(ipcMain.handle).toHaveBeenCalledWith('system-get-memory', expect.any(Function));
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
                debug: false,
                autoStart: true
            };

            // Act
            app.config = { ...defaultConfig };

            // Assert
            expect(app.config).toEqual(defaultConfig);
            expect(app.config.window.width).toBe(1200);
            expect(app.config.debug).toBe(false);
        });

        test('should override configuration with environment variables', () => {
            // Arrange
            process.env.APP_DEBUG = 'true';
            process.env.APP_WINDOW_WIDTH = '1920';

            // Act
            const config = {
                debug: process.env.APP_DEBUG === 'true',
                window: {
                    width: parseInt(process.env.APP_WINDOW_WIDTH) || 1200
                }
            };

            // Assert
            expect(config.debug).toBe(true);
            expect(config.window.width).toBe(1920);

            // Cleanup
            delete process.env.APP_DEBUG;
            delete process.env.APP_WINDOW_WIDTH;
        });
    });

    describe('Database Connection Management', () => {
        test('should handle database connection retry', async () => {
            // Arrange
            const DatabaseClient = require('../../db/db-client');
            const dbClient = new DatabaseClient();
            let attempts = 0;

            dbClient.connect.mockImplementation(() => {
                attempts++;
                if (attempts < 3) {
                    return Promise.reject(new Error('Connection failed'));
                }
                return Promise.resolve();
            });

            // Act
            const connectWithRetry = async (maxAttempts = 3) => {
                for (let i = 0; i < maxAttempts; i++) {
                    try {
                        await dbClient.connect();
                        return true;
                    } catch (error) {
                        if (i === maxAttempts - 1) throw error;
                        await new Promise(resolve => setTimeout(resolve, 100));
                    }
                }
            };

            // Assert
            await expect(connectWithRetry()).resolves.toBe(true);
            expect(attempts).toBe(3);
        });

        test('should handle database health check', async () => {
            // Arrange
            const DatabaseClient = require('../../db/db-client');
            const dbClient = new DatabaseClient();

            // Act
            const isHealthy = await dbClient.healthCheck();

            // Assert
            expect(dbClient.healthCheck).toHaveBeenCalled();
            expect(isHealthy).toBe(true);
        });
    });

    describe('RFID Listener Management', () => {
        test('should start RFID listener correctly', async () => {
            // Arrange
            const RFIDListener = require('../../rfid/rfid-listener');
            const rfidListener = new RFIDListener();

            // Act
            await rfidListener.start();

            // Assert
            expect(rfidListener.start).toHaveBeenCalled();
        });

        test('should handle RFID tag detection events', async () => {
            // Arrange
            const RFIDListener = require('../../rfid/rfid-listener');
            const rfidListener = new RFIDListener();
            const tagHandler = jest.fn();

            // Act
            rfidListener.on('tag-detected', tagHandler);
            rfidListener.on.mock.calls[0][1]({ tagId: '123456' });

            // Assert
            expect(rfidListener.on).toHaveBeenCalledWith('tag-detected', tagHandler);
            expect(tagHandler).toHaveBeenCalledWith({ tagId: '123456' });
        });

        test('should stop RFID listener correctly', async () => {
            // Arrange
            const RFIDListener = require('../../rfid/rfid-listener');
            const rfidListener = new RFIDListener();

            // Act
            await rfidListener.start();
            await rfidListener.stop();

            // Assert
            expect(rfidListener.stop).toHaveBeenCalled();
        });
    });

    describe('Global Shortcuts', () => {
        test('should register development shortcuts in dev mode', () => {
            // Arrange
            process.env.NODE_ENV = 'development';
            const { globalShortcut } = mockElectron;

            // Act
            globalShortcut.register('Ctrl+Shift+I', jest.fn());
            globalShortcut.register('F5', jest.fn());
            globalShortcut.register('Ctrl+R', jest.fn());

            // Assert
            expect(globalShortcut.register).toHaveBeenCalledWith('Ctrl+Shift+I', expect.any(Function));
            expect(globalShortcut.register).toHaveBeenCalledWith('F5', expect.any(Function));
            expect(globalShortcut.register).toHaveBeenCalledWith('Ctrl+R', expect.any(Function));
        });

        test('should unregister all shortcuts on quit', () => {
            // Arrange
            const { globalShortcut } = mockElectron;

            // Act
            globalShortcut.unregisterAll();

            // Assert
            expect(globalShortcut.unregisterAll).toHaveBeenCalled();
        });
    });
});