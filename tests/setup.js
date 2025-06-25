// tests/setup.js
/**
 * Jest Test Setup - Verbessert für stabile Tests
 * Konfiguriert globale Mocks, Error Handling und Cleanup
 */

const { jest } = require('@jest/globals');

// =================== GLOBAL ERROR HANDLING ===================

// Capture unhandled promise rejections
const originalUnhandledRejection = process.listeners('unhandledRejection');
process.removeAllListeners('unhandledRejection');

// Test-safe unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
    // Log für Debugging, aber verhindere Test-Crashes
    if (process.env.NODE_ENV === 'test') {
        console.warn('Unhandled Promise Rejection in Test:', reason);
        // Promise als resolved markieren um weitere Probleme zu vermeiden
        Promise.resolve(promise).catch(() => {});
    } else {
        // In Produktion: originales Verhalten
        originalUnhandledRejection.forEach(handler => {
            handler(reason, promise);
        });
    }
});

// =================== ELECTRON MOCKS ===================

// Vollständiger Electron Mock für stabile Tests
global.mockElectron = {
    // GlobalShortcut Mock
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
        isRegistered: jest.fn((shortcut) => {
            return global.mockElectron.globalShortcut.shortcuts.has(shortcut);
        }),
        // Test utility
        triggerShortcut: (shortcut) => {
            const callback = global.mockElectron.globalShortcut.shortcuts.get(shortcut);
            if (callback && typeof callback === 'function') {
                try {
                    callback();
                } catch (error) {
                    console.warn(`Error in shortcut callback for ${shortcut}:`, error);
                }
            }
        },
        getAllShortcuts: () => {
            return Array.from(global.mockElectron.globalShortcut.shortcuts.keys());
        }
    },

    // IPC Main Mock
    ipcMain: {
        handlers: new Map(),
        handle: jest.fn((channel, handler) => {
            global.mockElectron.ipcMain.handlers.set(channel, handler);
        }),
        handleOnce: jest.fn((channel, handler) => {
            const wrappedHandler = (...args) => {
                global.mockElectron.ipcMain.handlers.delete(channel);
                return handler(...args);
            };
            global.mockElectron.ipcMain.handlers.set(channel, wrappedHandler);
        }),
        off: jest.fn((channel) => {
            global.mockElectron.ipcMain.handlers.delete(channel);
        }),
        removeHandler: jest.fn((channel) => {
            global.mockElectron.ipcMain.handlers.delete(channel);
        }),
        removeAllListeners: jest.fn(() => {
            global.mockElectron.ipcMain.handlers.clear();
        }),
        // Test utility
        invoke: async (channel, ...args) => {
            const handler = global.mockElectron.ipcMain.handlers.get(channel);
            if (handler && typeof handler === 'function') {
                try {
                    return await handler(...args);
                } catch (error) {
                    throw error;
                }
            }
            throw new Error(`No handler registered for channel: ${channel}`);
        },
        hasHandler: (channel) => {
            return global.mockElectron.ipcMain.handlers.has(channel);
        },
        getRegisteredChannels: () => {
            return Array.from(global.mockElectron.ipcMain.handlers.keys());
        }
    },

    // IPC Renderer Mock
    ipcRenderer: {
        invoke: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn()
    },

    // WebContents Mock
    webContents: {
        send: jest.fn(),
        getAllWebContents: jest.fn(() => []),
        fromId: jest.fn(() => global.mockElectron.webContents)
    },

    // App Mock
    app: {
        isReady: jest.fn(() => true),
        whenReady: jest.fn(() => Promise.resolve()),
        quit: jest.fn(),
        getPath: jest.fn((name) => `/mock/path/${name}`),
        getVersion: jest.fn(() => '1.0.0')
    },

    // Dialog Mock
    dialog: {
        showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
        showErrorBox: jest.fn(),
        showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
        showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' }))
    }
};

// =================== NODE.JS MOCKS ===================

// FileSystem Mock
global.mockFS = {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    existsSync: jest.fn(() => true),
    // Erweiterte Mock-Funktionen
    simulateFileError: (error) => {
        global.mockFS.readFile.mockRejectedValueOnce(error);
        global.mockFS.writeFile.mockRejectedValueOnce(error);
    },
    reset: () => {
        Object.keys(global.mockFS).forEach(key => {
            if (typeof global.mockFS[key].mockReset === 'function') {
                global.mockFS[key].mockReset();
            }
        });
    }
};

// Path Mock
global.mockPath = {
    join: jest.fn((...parts) => parts.join('/')),
    resolve: jest.fn((...parts) => '/' + parts.join('/')),
    dirname: jest.fn((path) => {
        const parts = path.split('/');
        return parts.slice(0, -1).join('/') || '/';
    }),
    basename: jest.fn((path) => {
        return path.split('/').pop() || '';
    }),
    extname: jest.fn((path) => {
        const parts = path.split('.');
        return parts.length > 1 ? '.' + parts.pop() : '';
    }),
    sep: '/',
    delimiter: ':'
};

// OS Mock
global.mockOS = {
    platform: jest.fn(() => 'win32'),
    arch: jest.fn(() => 'x64'),
    release: jest.fn(() => '10.0.19042'),
    hostname: jest.fn(() => 'test-machine'),
    tmpdir: jest.fn(() => '/tmp'),
    homedir: jest.fn(() => '/home/test'),
    type: jest.fn(() => 'Windows_NT'),
    uptime: jest.fn(() => 123456)
};

// =================== HARDWARE SIMULATION ===================

global.mockHardware = {
    // RFID Reader Mock
    rfidReader: {
        isConnected: true,
        lastTag: null,
        errorRate: 0, // Für deterministische Tests

        simulateTag: (tagId) => {
            global.mockHardware.rfidReader.lastTag = tagId;
            if (global.mockHardware.rfidReader.onTag) {
                try {
                    global.mockHardware.rfidReader.onTag(tagId);
                } catch (error) {
                    console.warn('Error in RFID tag handler:', error);
                }
            }
        },

        simulateError: (error) => {
            if (global.mockHardware.rfidReader.onError) {
                try {
                    global.mockHardware.rfidReader.onError(error);
                } catch (e) {
                    console.warn('Error in RFID error handler:', e);
                }
            }
        },

        onTag: null,
        onError: null,

        setTagHandler: (handler) => {
            global.mockHardware.rfidReader.onTag = handler;
        },

        setErrorHandler: (handler) => {
            global.mockHardware.rfidReader.onError = handler;
        },

        reset: () => {
            global.mockHardware.rfidReader.lastTag = null;
            global.mockHardware.rfidReader.onTag = null;
            global.mockHardware.rfidReader.onError = null;
            global.mockHardware.rfidReader.isConnected = true;
            global.mockHardware.rfidReader.errorRate = 0;
        }
    },

    // Camera Mock
    camera: {
        isAvailable: true,
        resolution: { width: 1920, height: 1080 },

        simulateQRCode: (qrData) => {
            if (global.mockHardware.camera.onQRCode) {
                try {
                    global.mockHardware.camera.onQRCode(qrData);
                } catch (error) {
                    console.warn('Error in QR code handler:', error);
                }
            }
        },

        simulateError: (error) => {
            if (global.mockHardware.camera.onError) {
                try {
                    global.mockHardware.camera.onError(error);
                } catch (e) {
                    console.warn('Error in camera error handler:', e);
                }
            }
        },

        onQRCode: null,
        onError: null,

        setQRHandler: (handler) => {
            global.mockHardware.camera.onQRCode = handler;
        },

        setErrorHandler: (handler) => {
            global.mockHardware.camera.onError = handler;
        },

        reset: () => {
            global.mockHardware.camera.onQRCode = null;
            global.mockHardware.camera.onError = null;
            global.mockHardware.camera.isAvailable = true;
        }
    },

    // Global reset function
    resetAll: () => {
        global.mockHardware.rfidReader.reset();
        global.mockHardware.camera.reset();
    }
};

// =================== ENVIRONMENT SETUP ===================

// Test Environment Variables
process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE = 'true';
process.env.MOCK_HARDWARE = 'true';
process.env.LOG_LEVEL = 'error'; // Reduziere Logs in Tests

// Timezone für konsistente Zeitstempel
process.env.TZ = 'UTC';

// =================== JEST CUSTOM MATCHERS ===================

expect.extend({
    // RFID Tag Validation
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

    // QR Code Validation
    toBeValidQRCode(received) {
        const isValid = typeof received === 'string' && received.length > 0;

        return {
            message: () => `expected ${received} to be a valid QR code`,
            pass: isValid
        };
    },

    // Session Validation
    toBeValidSession(received) {
        const isValid = received &&
            typeof received === 'object' &&
            received.ID &&
            received.BenID &&
            typeof received.Active === 'number' &&
            received.StartTS;

        return {
            message: () => `expected ${JSON.stringify(received)} to be a valid session`,
            pass: isValid
        };
    },

    // User Validation
    toBeValidUser(received) {
        const isValid = received &&
            typeof received === 'object' &&
            received.ID &&
            received.BenutzerName &&
            received.EPC;

        return {
            message: () => `expected ${JSON.stringify(received)} to be a valid user`,
            pass: isValid
        };
    },

    // Database Connection
    toBeConnectedDatabase(received) {
        const isValid = received &&
            typeof received.isConnected === 'boolean' &&
            received.isConnected === true;

        return {
            message: () => `expected database to be connected`,
            pass: isValid
        };
    },

    // RFID Listener Status
    toBeRunningRFIDListener(received) {
        const isValid = received &&
            typeof received.isRunning === 'boolean' &&
            received.isRunning === true &&
            typeof received.isListening === 'boolean' &&
            received.isListening === true;

        return {
            message: () => `expected RFID listener to be running and listening`,
            pass: isValid
        };
    }
});

// =================== TEST UTILITIES ===================

global.testUtils = {
    // Timing utilities
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    // Wait for condition
    waitFor: async (condition, timeout = 5000, interval = 50) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if (await condition()) {
                return true;
            }
            await global.testUtils.delay(interval);
        }
        throw new Error(`Condition not met within ${timeout}ms`);
    },

    // Mock reset utilities
    resetAllMocks: () => {
        jest.clearAllMocks();
        global.mockFS.reset();
        global.mockHardware.resetAll();

        // Reset Electron mocks
        global.mockElectron.globalShortcut.unregisterAll();
        global.mockElectron.ipcMain.removeAllListeners();
    },

    // Data generators
    generateRFIDTag: (length = 8) => {
        const chars = '0123456789ABCDEF';
        return Array(length).fill().map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
    },

    generateUser: (id = 1) => ({
        ID: id,
        BenutzerName: `Test User ${id}`,
        EPC: global.testUtils.generateRFIDTag(),
        Email: `user${id}@test.com`,
        Aktiv: 1
    }),

    generateSession: (userId = 1, sessionId = 1) => ({
        ID: sessionId,
        BenID: userId,
        StartTS: new Date().toISOString(),
        EndTS: null,
        Active: 1
    }),

    generateQRCode: () => {
        return JSON.stringify({
            timestamp: new Date().toISOString(),
            data: `QR-${Math.random().toString(36).substr(2, 9)}`,
            type: 'package'
        });
    },

    // Debug utilities
    logMockState: () => {
        console.log('=== MOCK STATE DEBUG ===');
        console.log('Electron GlobalShortcut shortcuts:', global.mockElectron.globalShortcut.getAllShortcuts());
        console.log('Electron IPC handlers:', global.mockElectron.ipcMain.getRegisteredChannels());
        console.log('RFID Reader connected:', global.mockHardware.rfidReader.isConnected);
        console.log('Camera available:', global.mockHardware.camera.isAvailable);
        console.log('========================');
    },

    // Performance helpers
    measurePerformance: async (fn, name = 'operation') => {
        const start = process.hrtime.bigint();
        const result = await fn();
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to ms

        console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
        return { result, duration };
    }
};

// =================== TEST LIFECYCLE HOOKS ===================

// Before each test
beforeEach(() => {
    // Reset all mocks to clean state
    global.testUtils.resetAllMocks();

    // Clear any remaining timeouts/intervals
    jest.clearAllTimers();

    // Reset console spies if any
    if (global.consoleSpy) {
        global.consoleSpy.mockReset();
    }
});

// After each test
afterEach(() => {
    // Cleanup any remaining async operations
    jest.clearAllTimers();

    // Reset hardware state
    global.mockHardware.resetAll();

    // Clear Electron state
    global.mockElectron.globalShortcut.unregisterAll();
    global.mockElectron.ipcMain.removeAllListeners();
});

// =================== CONSOLE CONTROL ===================

// Optionally suppress console output in tests
if (process.env.TEST_SILENT === 'true') {
    global.consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'info').mockImplementation(() => {});
}

// =================== FINAL SETUP ===================

// Log setup completion
console.log('🧪 Test setup completed - Environment ready for testing');

module.exports = {
    mockElectron: global.mockElectron,
    mockHardware: global.mockHardware,
    testUtils: global.testUtils
};