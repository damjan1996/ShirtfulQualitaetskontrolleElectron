/**
 * Jest Test Setup
 * Globale Konfiguration und Mocks für alle Tests
 */

// Console-Logging für Tests reduzieren (optional)
const originalConsole = global.console;
global.console = {
    ...originalConsole,
    // Uncomment to suppress console output during tests
    // log: jest.fn(),
    // warn: jest.fn(),
    // error: jest.fn(),
    // info: jest.fn(),
    // debug: jest.fn()
};

// Global Mock für Electron
global.mockElectron = {
    // Global Shortcut Mock
    globalShortcut: {
        shortcuts: new Map(),

        register: jest.fn((shortcut, callback) => {
            if (global.mockElectron.globalShortcut.shortcuts.has(shortcut)) {
                return false; // Bereits registriert
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

        isRegistered: jest.fn((shortcut) => {
            return global.mockElectron.globalShortcut.shortcuts.has(shortcut);
        }),

        // Test-Hilfsfunktion
        triggerShortcut: (shortcut) => {
            const callback = global.mockElectron.globalShortcut.shortcuts.get(shortcut);
            if (callback && typeof callback === 'function') {
                try {
                    callback();
                } catch (error) {
                    console.error(`Error triggering shortcut '${shortcut}':`, error);
                }
            }
        },

        // Debug-Hilfsfunktionen
        getRegisteredShortcuts: () => {
            return Array.from(global.mockElectron.globalShortcut.shortcuts.keys());
        },

        getShortcutCount: () => {
            return global.mockElectron.globalShortcut.shortcuts.size;
        }
    },

    // IPC Main Mock
    ipcMain: {
        handlers: new Map(),

        handle: jest.fn((channel, handler) => {
            global.mockElectron.ipcMain.handlers.set(channel, handler);
        }),

        handleOnce: jest.fn((channel, handler) => {
            global.mockElectron.ipcMain.handlers.set(channel, (...args) => {
                global.mockElectron.ipcMain.handlers.delete(channel);
                return handler(...args);
            });
        }),

        removeHandler: jest.fn((channel) => {
            global.mockElectron.ipcMain.handlers.delete(channel);
        }),

        removeAllListeners: jest.fn(() => {
            global.mockElectron.ipcMain.handlers.clear();
        }),

        on: jest.fn(),
        once: jest.fn(),
        off: jest.fn(),
        emit: jest.fn(),

        // Simuliere IPC-Aufruf für Tests
        invoke: async (channel, ...args) => {
            const handler = global.mockElectron.ipcMain.handlers.get(channel);
            if (handler && typeof handler === 'function') {
                try {
                    return await handler(...args);
                } catch (error) {
                    throw new Error(`IPC handler error for channel '${channel}': ${error.message}`);
                }
            }
            throw new Error(`No handler registered for channel: ${channel}`);
        },

        // Test-Hilfsfunktionen
        getRegisteredChannels: () => {
            return Array.from(global.mockElectron.ipcMain.handlers.keys());
        },

        hasHandler: (channel) => {
            return global.mockElectron.ipcMain.handlers.has(channel);
        }
    },

    // IPC Renderer Mock (für Frontend-Tests)
    ipcRenderer: {
        invoke: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn()
    },

    // Web Contents Mock
    webContents: {
        send: jest.fn(),
        getAllWebContents: jest.fn(() => []),
        fromId: jest.fn(),
        getFocusedWebContents: jest.fn()
    },

    // App Mock
    app: {
        quit: jest.fn(),
        exit: jest.fn(),
        isReady: jest.fn(() => true),
        whenReady: jest.fn(() => Promise.resolve()),
        getName: jest.fn(() => 'RFID QR Test App'),
        getVersion: jest.fn(() => '1.0.0'),
        getAppPath: jest.fn(() => '/test/app/path'),
        getPath: jest.fn((name) => `/test/${name}`),
        on: jest.fn(),
        once: jest.fn(),
        emit: jest.fn()
    },

    // Browser Window Mock
    BrowserWindow: jest.fn().mockImplementation(() => ({
        loadFile: jest.fn(),
        loadURL: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        close: jest.fn(),
        focus: jest.fn(),
        minimize: jest.fn(),
        maximize: jest.fn(),
        unmaximize: jest.fn(),
        isMaximized: jest.fn(() => false),
        setFullScreen: jest.fn(),
        isFullScreen: jest.fn(() => false),
        webContents: {
            send: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            removeAllListeners: jest.fn(),
            openDevTools: jest.fn(),
            closeDevTools: jest.fn()
        },
        on: jest.fn(),
        once: jest.fn(),
        removeAllListeners: jest.fn()
    })),

    // Dialog Mock
    dialog: {
        showOpenDialog: jest.fn(),
        showSaveDialog: jest.fn(),
        showMessageBox: jest.fn(),
        showErrorBox: jest.fn(),
        showCertificateTrustDialog: jest.fn()
    },

    // Menu Mock
    Menu: {
        buildFromTemplate: jest.fn(),
        setApplicationMenu: jest.fn(),
        getApplicationMenu: jest.fn(),
        popup: jest.fn()
    },

    // Notification Mock
    Notification: jest.fn().mockImplementation(() => ({
        show: jest.fn(),
        close: jest.fn(),
        on: jest.fn(),
        once: jest.fn()
    })),

    // Shell Mock
    shell: {
        openExternal: jest.fn(),
        openPath: jest.fn(),
        showItemInFolder: jest.fn(),
        moveItemToTrash: jest.fn(),
        beep: jest.fn()
    }
};

// Node.js Module Mocks
global.mockNodeModules = {
    // File System Mock
    fs: {
        promises: {
            readFile: jest.fn(),
            writeFile: jest.fn(),
            mkdir: jest.fn(),
            rmdir: jest.fn(),
            unlink: jest.fn(),
            stat: jest.fn(),
            access: jest.fn()
        },
        readFileSync: jest.fn(),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(),
        mkdirSync: jest.fn(),
        statSync: jest.fn()
    },

    // Path Mock
    path: {
        join: jest.fn((...args) => args.join('/')),
        resolve: jest.fn((...args) => '/' + args.join('/')),
        dirname: jest.fn((p) => p.split('/').slice(0, -1).join('/')),
        basename: jest.fn((p) => p.split('/').pop()),
        extname: jest.fn((p) => {
            const parts = p.split('.');
            return parts.length > 1 ? '.' + parts.pop() : '';
        }),
        sep: '/',
        delimiter: ':'
    },

    // OS Mock
    os: {
        platform: jest.fn(() => 'win32'),
        arch: jest.fn(() => 'x64'),
        release: jest.fn(() => '10.0.19042'),
        hostname: jest.fn(() => 'test-machine'),
        tmpdir: jest.fn(() => '/tmp'),
        homedir: jest.fn(() => '/home/test')
    }
};

// Hardware-Simulation Mocks
global.mockHardware = {
    // RFID Reader Mock
    rfidReader: {
        isConnected: true,
        lastTag: null,

        simulateTag: (tagId) => {
            global.mockHardware.rfidReader.lastTag = tagId;
            if (global.mockHardware.rfidReader.onTag) {
                global.mockHardware.rfidReader.onTag(tagId);
            }
        },

        onTag: null,
        setTagHandler: (handler) => {
            global.mockHardware.rfidReader.onTag = handler;
        }
    },

    // Camera Mock
    camera: {
        isAvailable: true,
        resolution: { width: 1920, height: 1080 },

        simulateQRCode: (qrData) => {
            if (global.mockHardware.camera.onQRCode) {
                global.mockHardware.camera.onQRCode(qrData);
            }
        },

        onQRCode: null,
        setQRHandler: (handler) => {
            global.mockHardware.camera.onQRCode = handler;
        }
    }
};

// Environment Variables Mock
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE = 'true';
process.env.MOCK_HARDWARE = 'true';

// Jest Custom Matchers Setup
expect.extend({
    toBeValidRFIDTag(received) {
        const isValid = typeof received === 'string' &&
            received.length >= 6 &&
            received.length <= 20 &&
            /^[0-9A-Fa-f]+$/.test(received);

        return {
            message: () => `expected ${received} to be a valid RFID tag`,
            pass: isValid
        };
    },

    toBeValidQRCode(received) {
        const isValid = typeof received === 'string' && received.length > 0;

        return {
            message: () => `expected ${received} to be a valid QR code`,
            pass: isValid
        };
    },

    toBeValidSession(received) {
        const isValid = received &&
            typeof received === 'object' &&
            typeof received.id === 'number' &&
            typeof received.userId === 'number' &&
            received.startTime instanceof Date;

        return {
            message: () => `expected ${JSON.stringify(received)} to be a valid session object`,
            pass: isValid
        };
    }
});

// Global Test Utilities
global.testUtils = {
    // Timing Utilities
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    // Mock Reset Utilities
    resetAllMocks: () => {
        jest.clearAllMocks();

        // Reset Electron Mocks
        global.mockElectron.globalShortcut.shortcuts.clear();
        global.mockElectron.ipcMain.handlers.clear();

        // Reset Hardware Mocks
        global.mockHardware.rfidReader.lastTag = null;
        global.mockHardware.rfidReader.onTag = null;
        global.mockHardware.camera.onQRCode = null;
    },

    // Test Data Generators
    generateRFIDTag: () => {
        return Math.random().toString(16).substr(2, 8).toUpperCase();
    },

    generateQRCode: () => {
        return `QR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    },

    generateUser: (id = 1) => ({
        id: id,
        name: `Test User ${id}`,
        epc: global.testUtils.generateRFIDTag(),
        email: `user${id}@test.com`,
        department: 'Test Department',
        active: true
    }),

    generateSession: (userId = 1, sessionId = null) => ({
        id: sessionId || Math.floor(Math.random() * 10000) + 1000,
        userId: userId,
        startTime: new Date(),
        endTime: null,
        active: true
    }),

    // Debug Utilities
    logMockState: () => {
        console.log('=== Mock State Debug ===');
        console.log('Electron Shortcuts:', global.mockElectron.globalShortcut.getShortcutCount());
        console.log('IPC Handlers:', global.mockElectron.ipcMain.getRegisteredChannels());
        console.log('Last RFID Tag:', global.mockHardware.rfidReader.lastTag);
        console.log('========================');
    }
};

// Unhandled Promise Rejection Handler für Tests
const unhandledRejections = new Map();

process.on('unhandledRejection', (reason, promise) => {
    unhandledRejections.set(promise, reason);
    console.error('Unhandled promise rejection in test:', reason);
});

process.on('rejectionHandled', (promise) => {
    unhandledRejections.delete(promise);
});

// Test Cleanup nach jedem Test
afterEach(() => {
    // Cleanup Timers
    jest.clearAllTimers();

    // Reset Mocks (optional, kann per Test gesteuert werden)
    // global.testUtils.resetAllMocks();

    // Check for unhandled rejections
    if (unhandledRejections.size > 0) {
        console.warn(`${unhandledRejections.size} unhandled promise rejections detected`);
    }
});

// Global Setup Logging
console.log('🧪 Jest Test Setup completed');
console.log(`📊 Running in ${process.env.NODE_ENV} environment`);
console.log(`🔧 Mock Hardware: ${process.env.MOCK_HARDWARE}`);
console.log(`💾 Test Database: ${process.env.TEST_DATABASE}`);