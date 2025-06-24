// tests/e2e/app-startup.test.js
/**
 * End-to-End Tests für Application Startup
 * Testet den kompletten App-Start-Prozess
 */

const { mockElectron } = require('../mocks/electron.mock');
const MockDatabaseClient = require('../mocks/db-client.mock');
const MockRFIDListener = require('../mocks/rfid-listener.mock');
const { MockQRScanner } = require('../mocks/qr-scanner.mock');

// Mock alle externen Dependencies
jest.mock('electron', () => mockElectron);
jest.mock('mssql', () => global.mockMSSql);
jest.mock('node-hid', () => global.mockNodeHid);

describe('E2E: Application Startup', () => {
    let app;
    let mainWindow;
    let systemComponents;

    beforeEach(() => {
        // Reset alle Mocks
        jest.clearAllMocks();

        // Mock Application State
        app = {
            version: '1.0.1',
            isReady: false,
            mainWindow: null,
            systemComponents: {
                database: null,
                rfidListener: null,
                qrScanner: null
            },
            config: {
                database: {
                    server: 'localhost',
                    database: 'RdScanner_Test',
                    user: 'test_user',
                    password: 'test_password'
                },
                window: {
                    width: 1200,
                    height: 800,
                    minWidth: 800,
                    minHeight: 600
                },
                rfid: {
                    enabled: true,
                    inputTimeout: 200,
                    maxBufferLength: 15
                }
            },
            stats: {
                startTime: null,
                readyTime: null,
                componentInitTimes: {}
            }
        };

        // Mock System Components
        systemComponents = {
            database: new MockDatabaseClient(),
            rfidListener: new MockRFIDListener(),
            qrScanner: new MockQRScanner()
        };

        // Setup Environment
        process.env.NODE_ENV = 'test';
    });

    afterEach(async () => {
        // Cleanup
        if (systemComponents.qrScanner && systemComponents.qrScanner.isScanning) {
            await systemComponents.qrScanner.stop();
        }
        if (systemComponents.rfidListener && systemComponents.rfidListener.isListening) {
            await systemComponents.rfidListener.stop();
        }
        if (systemComponents.database && systemComponents.database.isConnected) {
            await systemComponents.database.close();
        }
    });

    describe('Application Bootstrap', () => {
        test('should initialize Electron app correctly', async () => {
            app.stats.startTime = Date.now();

            // 1. App should request single instance lock
            const hasSingleInstanceLock = mockElectron.app.requestSingleInstanceLock();
            expect(hasSingleInstanceLock).toBe(true);

            // 2. App should wait for ready event
            const readyPromise = mockElectron.app.whenReady();
            await readyPromise;

            app.isReady = true;
            app.stats.readyTime = Date.now();

            expect(app.isReady).toBe(true);
            expect(app.stats.readyTime).toBeGreaterThan(app.stats.startTime);
        });

        test('should create main window with correct configuration', async () => {
            await mockElectron.app.whenReady();

            // Create main window
            mainWindow = new mockElectron.BrowserWindow({
                width: app.config.window.width,
                height: app.config.window.height,
                minWidth: app.config.window.minWidth,
                minHeight: app.config.window.minHeight,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: 'preload.js'
                },
                show: false // Don't show until ready
            });

            app.mainWindow = mainWindow;

            expect(mainWindow).toBeDefined();
            expect(mainWindow.options.width).toBe(1200);
            expect(mainWindow.options.height).toBe(800);
            expect(mainWindow.options.webPreferences.contextIsolation).toBe(true);
            expect(mainWindow.options.webPreferences.nodeIntegration).toBe(false);
        });

        test('should load application files correctly', async () => {
            await mockElectron.app.whenReady();

            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            // Load main HTML file
            await mainWindow.loadFile('renderer/index.html');

            expect(mainWindow.loadFile).toHaveBeenCalledWith('renderer/index.html');
        });

        test('should handle window events correctly', async () => {
            await mockElectron.app.whenReady();

            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            // Setup window event handlers
            const windowEventHandlers = {
                ready: jest.fn(),
                closed: jest.fn(),
                minimize: jest.fn(),
                maximize: jest.fn()
            };

            mainWindow.on('ready-to-show', windowEventHandlers.ready);
            mainWindow.on('closed', windowEventHandlers.closed);
            mainWindow.on('minimize', windowEventHandlers.minimize);
            mainWindow.on('maximize', windowEventHandlers.maximize);

            // Simulate events
            mainWindow.emit('ready-to-show');
            mainWindow.emit('minimize');
            mainWindow.emit('maximize');

            expect(windowEventHandlers.ready).toHaveBeenCalled();
            expect(windowEventHandlers.minimize).toHaveBeenCalled();
            expect(windowEventHandlers.maximize).toHaveBeenCalled();
        });
    });

    describe('System Components Initialization', () => {
        beforeEach(async () => {
            await mockElectron.app.whenReady();
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;
        });

        test('should initialize database connection', async () => {
            const startTime = Date.now();

            // Initialize database
            const dbConnected = await systemComponents.database.connect();
            app.systemComponents.database = systemComponents.database;

            const endTime = Date.now();
            app.stats.componentInitTimes.database = endTime - startTime;

            expect(dbConnected).toBe(true);
            expect(systemComponents.database.isConnected).toBe(true);
            expect(app.stats.componentInitTimes.database).toBeGreaterThan(0);

            // Verify database health
            const healthCheck = await systemComponents.database.healthCheck();
            expect(healthCheck.connected).toBe(true);
            expect(healthCheck.server.database).toBe('RdScanner_Test');
        });

        test('should initialize RFID listener', async () => {
            const startTime = Date.now();

            // Initialize RFID listener
            const rfidStarted = await systemComponents.rfidListener.start();
            app.systemComponents.rfidListener = systemComponents.rfidListener;

            const endTime = Date.now();
            app.stats.componentInitTimes.rfid = endTime - startTime;

            expect(rfidStarted).toBe(true);
            expect(systemComponents.rfidListener.isListening).toBe(true);
            expect(app.stats.componentInitTimes.rfid).toBeGreaterThan(0);

            // Verify RFID functionality
            const rfidStats = systemComponents.rfidListener.getStats();
            expect(rfidStats.isListening).toBe(true);
            expect(rfidStats.registeredShortcuts).toBeDefined();
        });

        test('should initialize QR scanner', async () => {
            const startTime = Date.now();

            // QR scanner is initialized on-demand, so just prepare it
            app.systemComponents.qrScanner = systemComponents.qrScanner;

            const endTime = Date.now();
            app.stats.componentInitTimes.qrScanner = endTime - startTime;

            expect(app.systemComponents.qrScanner).toBeDefined();
            expect(app.stats.componentInitTimes.qrScanner).toBeGreaterThan(0);

            // Verify QR scanner can be started
            const qrStarted = await systemComponents.qrScanner.start();
            expect(qrStarted).toBe(true);
            expect(systemComponents.qrScanner.isScanning).toBe(true);
        });

        test('should handle component initialization failures', async () => {
            // Simulate database connection failure
            jest.spyOn(systemComponents.database, 'connect')
                .mockRejectedValueOnce(new Error('Database connection failed'));

            let dbError = null;
            try {
                await systemComponents.database.connect();
            } catch (error) {
                dbError = error;
            }

            expect(dbError).toBeDefined();
            expect(dbError.message).toBe('Database connection failed');
            expect(systemComponents.database.isConnected).toBe(false);

            // App should continue with degraded functionality
            app.systemComponents.database = null;

            // Other components should still work
            const rfidStarted = await systemComponents.rfidListener.start();
            expect(rfidStarted).toBe(true);
        });
    });

    describe('IPC Setup and Communication', () => {
        beforeEach(async () => {
            await mockElectron.app.whenReady();
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            // Initialize components
            await systemComponents.database.connect();
            await systemComponents.rfidListener.start();

            app.systemComponents = systemComponents;
        });

        test('should register all IPC handlers', () => {
            const ipcHandlers = new Map();

            // Register database handlers
            ipcHandlers.set('db-get-user-by-epc', async (event, tagId) => {
                return await app.systemComponents.database.getUserByEPC(tagId);
            });

            ipcHandlers.set('db-health-check', async () => {
                return await app.systemComponents.database.healthCheck();
            });

            // Register session handlers
            ipcHandlers.set('session-create', async (event, userId) => {
                return await app.systemComponents.database.createSession(userId);
            });

            ipcHandlers.set('session-end', async (event, sessionId) => {
                return await app.systemComponents.database.endSession(sessionId);
            });

            // Register QR handlers
            ipcHandlers.set('qr-scan-save', async (event, sessionId, payload) => {
                return await app.systemComponents.database.saveQRScan(sessionId, payload);
            });

            // Register RFID handlers
            ipcHandlers.set('rfid-get-stats', async () => {
                return app.systemComponents.rfidListener.getStats();
            });

            // Register window handlers
            ipcHandlers.set('window-minimize', () => {
                app.mainWindow.minimize();
                return true;
            });

            ipcHandlers.set('window-maximize', () => {
                app.mainWindow.maximize();
                return true;
            });

            // Verify all handlers are registered
            expect(ipcHandlers.size).toBe(8);
            expect(ipcHandlers.has('db-get-user-by-epc')).toBe(true);
            expect(ipcHandlers.has('session-create')).toBe(true);
            expect(ipcHandlers.has('qr-scan-save')).toBe(true);
            expect(ipcHandlers.has('window-minimize')).toBe(true);
        });

        test('should handle IPC communication correctly', async () => {
            // Mock IPC handler registration
            const mockIpcHandlers = new Map();

            mockElectron.ipcMain.handle.mockImplementation((channel, handler) => {
                mockIpcHandlers.set(channel, handler);
            });

            // Register a test handler
            const testHandler = async (event, testData) => {
                return { success: true, data: testData };
            };

            mockElectron.ipcMain.handle('test-channel', testHandler);

            expect(mockElectron.ipcMain.handle).toHaveBeenCalledWith('test-channel', testHandler);
        });

        test('should handle renderer events correctly', () => {
            const mockWebContents = app.mainWindow.webContents;

            // Test sending events to renderer
            const testEventData = {
                type: 'system-status',
                status: {
                    database: true,
                    rfid: true,
                    qrScanner: false
                }
            };

            mockWebContents.send('system-status-update', testEventData);

            expect(mockWebContents.send).toHaveBeenCalledWith('system-status-update', testEventData);
        });
    });

    describe('Application Ready State', () => {
        test('should complete full startup sequence', async () => {
            const startupSteps = [];

            // 1. Electron app initialization
            startupSteps.push('electron-init');
            await mockElectron.app.whenReady();
            app.isReady = true;

            // 2. Window creation
            startupSteps.push('window-creation');
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            // 3. System components initialization
            startupSteps.push('components-init');
            await systemComponents.database.connect();
            await systemComponents.rfidListener.start();
            app.systemComponents = systemComponents;

            // 4. IPC setup
            startupSteps.push('ipc-setup');
            // IPC handlers would be registered here

            // 5. Load renderer
            startupSteps.push('renderer-load');
            await mainWindow.loadFile('renderer/index.html');

            // 6. Show window
            startupSteps.push('window-show');
            mainWindow.show();

            // Verify complete startup
            expect(startupSteps).toEqual([
                'electron-init',
                'window-creation',
                'components-init',
                'ipc-setup',
                'renderer-load',
                'window-show'
            ]);

            expect(app.isReady).toBe(true);
            expect(app.mainWindow).toBeDefined();
            expect(systemComponents.database.isConnected).toBe(true);
            expect(systemComponents.rfidListener.isListening).toBe(true);
        });

        test('should provide system health status', async () => {
            // Complete startup
            await mockElectron.app.whenReady();
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            await systemComponents.database.connect();
            await systemComponents.rfidListener.start();
            app.systemComponents = systemComponents;

            // Get system health
            const systemHealth = {
                app: {
                    ready: app.isReady,
                    version: app.version,
                    uptime: Date.now() - (app.stats.startTime || Date.now())
                },
                components: {
                    database: {
                        connected: systemComponents.database.isConnected,
                        health: await systemComponents.database.healthCheck()
                    },
                    rfid: {
                        listening: systemComponents.rfidListener.isListening,
                        stats: systemComponents.rfidListener.getStats()
                    },
                    qrScanner: {
                        available: true,
                        scanning: systemComponents.qrScanner.isScanning
                    }
                },
                window: {
                    created: app.mainWindow !== null,
                    visible: app.mainWindow ? app.mainWindow.isVisible() : false
                }
            };

            expect(systemHealth.app.ready).toBe(true);
            expect(systemHealth.app.version).toBe('1.0.1');
            expect(systemHealth.components.database.connected).toBe(true);
            expect(systemHealth.components.rfid.listening).toBe(true);
            expect(systemHealth.window.created).toBe(true);
        });

        test('should handle graceful shutdown', async () => {
            // Complete startup
            await mockElectron.app.whenReady();
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            await systemComponents.database.connect();
            await systemComponents.rfidListener.start();
            app.systemComponents = systemComponents;

            // Simulate shutdown
            const shutdownSteps = [];

            // 1. Stop QR scanner if running
            if (systemComponents.qrScanner.isScanning) {
                shutdownSteps.push('qr-scanner-stop');
                await systemComponents.qrScanner.stop();
            }

            // 2. Stop RFID listener
            shutdownSteps.push('rfid-stop');
            await systemComponents.rfidListener.stop();

            // 3. Close database connection
            shutdownSteps.push('database-close');
            await systemComponents.database.close();

            // 4. Close window
            shutdownSteps.push('window-close');
            mainWindow.close();

            // 5. Quit app
            shutdownSteps.push('app-quit');
            mockElectron.app.quit();

            // Verify graceful shutdown
            expect(shutdownSteps).toContain('rfid-stop');
            expect(shutdownSteps).toContain('database-close');
            expect(shutdownSteps).toContain('window-close');
            expect(shutdownSteps).toContain('app-quit');

            expect(systemComponents.rfidListener.isListening).toBe(false);
            expect(systemComponents.database.isConnected).toBe(false);
            expect(mockElectron.app.quit).toHaveBeenCalled();
        });
    });

    describe('Error Handling and Recovery', () => {
        test('should handle startup errors gracefully', async () => {
            const errors = [];

            try {
                // Simulate database connection failure
                jest.spyOn(systemComponents.database, 'connect')
                    .mockRejectedValueOnce(new Error('Database unavailable'));

                await systemComponents.database.connect();
            } catch (error) {
                errors.push({ component: 'database', error: error.message });
            }

            try {
                // Simulate RFID hardware failure
                jest.spyOn(systemComponents.rfidListener, 'start')
                    .mockRejectedValueOnce(new Error('RFID hardware not found'));

                await systemComponents.rfidListener.start();
            } catch (error) {
                errors.push({ component: 'rfid', error: error.message });
            }

            // App should continue with degraded functionality
            await mockElectron.app.whenReady();
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            expect(errors.length).toBe(2);
            expect(errors.find(e => e.component === 'database')).toBeDefined();
            expect(errors.find(e => e.component === 'rfid')).toBeDefined();
            expect(app.mainWindow).toBeDefined(); // Window should still be created
        });

        test('should provide fallback functionality', async () => {
            // Startup with some components failing
            await mockElectron.app.whenReady();
            mainWindow = new mockElectron.BrowserWindow();
            app.mainWindow = mainWindow;

            // Only database succeeds
            await systemComponents.database.connect();
            app.systemComponents.database = systemComponents.database;
            app.systemComponents.rfidListener = null; // Failed
            app.systemComponents.qrScanner = null; // Not available

            // Check fallback status
            const fallbackStatus = {
                database: app.systemComponents.database !== null,
                rfid: app.systemComponents.rfidListener !== null,
                qrScanner: app.systemComponents.qrScanner !== null,
                basicFunctionality: app.mainWindow !== null
            };

            expect(fallbackStatus.database).toBe(true);
            expect(fallbackStatus.rfid).toBe(false);
            expect(fallbackStatus.qrScanner).toBe(false);
            expect(fallbackStatus.basicFunctionality).toBe(true);
        });

        test('should retry failed component initialization', async () => {
            let connectionAttempts = 0;

            // Mock database connection that fails first time, succeeds second time
            jest.spyOn(systemComponents.database, 'connect')
                .mockImplementation(async () => {
                    connectionAttempts++;
                    if (connectionAttempts === 1) {
                        throw new Error('Connection timeout');
                    }
                    // Call original implementation for second attempt
                    return true;
                });

            // First attempt fails
            try {
                await systemComponents.database.connect();
            } catch (error) {
                expect(error.message).toBe('Connection timeout');
            }

            expect(connectionAttempts).toBe(1);
            expect(systemComponents.database.isConnected).toBe(false);

            // Retry succeeds
            systemComponents.database.connect.mockRestore();
            const retryResult = await systemComponents.database.connect();

            expect(retryResult).toBe(true);
            expect(systemComponents.database.isConnected).toBe(true);
        });
    });

    describe('Performance Monitoring', () => {
        test('should track startup performance', async () => {
            const performanceMetrics = {
                startTime: Date.now(),
                milestones: {}
            };

            // Track each startup phase
            performanceMetrics.milestones.electronReady = Date.now();
            await mockElectron.app.whenReady();

            performanceMetrics.milestones.windowCreated = Date.now();
            mainWindow = new mockElectron.BrowserWindow();

            performanceMetrics.milestones.databaseConnected = Date.now();
            await systemComponents.database.connect();

            performanceMetrics.milestones.rfidStarted = Date.now();
            await systemComponents.rfidListener.start();

            performanceMetrics.milestones.rendererLoaded = Date.now();
            await mainWindow.loadFile('renderer/index.html');

            performanceMetrics.milestones.appReady = Date.now();

            // Calculate durations
            const durations = {
                electronInit: performanceMetrics.milestones.electronReady - performanceMetrics.startTime,
                windowCreation: performanceMetrics.milestones.windowCreated - performanceMetrics.milestones.electronReady,
                databaseInit: performanceMetrics.milestones.databaseConnected - performanceMetrics.milestones.windowCreated,
                rfidInit: performanceMetrics.milestones.rfidStarted - performanceMetrics.milestones.databaseConnected,
                rendererLoad: performanceMetrics.milestones.rendererLoaded - performanceMetrics.milestones.rfidStarted,
                totalStartup: performanceMetrics.milestones.appReady - performanceMetrics.startTime
            };

            expect(durations.electronInit).toBeGreaterThan(0);
            expect(durations.windowCreation).toBeGreaterThan(0);
            expect(durations.databaseInit).toBeGreaterThan(0);
            expect(durations.rfidInit).toBeGreaterThan(0);
            expect(durations.rendererLoad).toBeGreaterThan(0);
            expect(durations.totalStartup).toBeGreaterThan(0);

            // Startup should be reasonably fast (in test environment)
            expect(durations.totalStartup).toBeLessThan(5000); // Less than 5 seconds
        });

        test('should monitor memory usage during startup', async () => {
            const memorySnapshots = [];

            // Take memory snapshot at start
            memorySnapshots.push({
                phase: 'start',
                memory: process.memoryUsage()
            });

            await mockElectron.app.whenReady();
            memorySnapshots.push({
                phase: 'electron-ready',
                memory: process.memoryUsage()
            });

            mainWindow = new mockElectron.BrowserWindow();
            memorySnapshots.push({
                phase: 'window-created',
                memory: process.memoryUsage()
            });

            await systemComponents.database.connect();
            await systemComponents.rfidListener.start();
            memorySnapshots.push({
                phase: 'components-initialized',
                memory: process.memoryUsage()
            });

            // Verify memory usage is reasonable
            expect(memorySnapshots.length).toBe(4);
            expect(memorySnapshots.every(s => s.memory.heapUsed > 0)).toBe(true);
            expect(memorySnapshots.every(s => s.memory.heapTotal > 0)).toBe(true);

            // Memory usage should increase during startup but not excessively
            const startMemory = memorySnapshots[0].memory.heapUsed;
            const endMemory = memorySnapshots[memorySnapshots.length - 1].memory.heapUsed;
            const memoryIncrease = endMemory - startMemory;

            expect(memoryIncrease).toBeGreaterThan(0); // Should use some memory
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // But not more than 100MB
        });
    });
});