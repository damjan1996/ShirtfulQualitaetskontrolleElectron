// tests/setup.js
/**
 * Jest Test Setup - Minimal ohne Babel Dependencies
 */

// Silence unhandled rejections in tests
process.on('unhandledRejection', (reason) => {
    // Only log important errors, ignore test rejections
    if (process.env.NODE_ENV === 'test' && reason && !String(reason).includes('Test rejection')) {
        // Silent in test mode
    }
});

beforeEach(() => {
    // Clean global state
    delete global.mockElectron;

    // Set test environment
    process.env.NODE_ENV = 'test';
    process.env.DEBUG = 'false';

    // Clear timers
    jest.clearAllTimers();

    // Setup mock electron
    global.mockElectron = {
        globalShortcut: {
            shortcuts: new Map(),
            register: jest.fn((shortcut, callback) => {
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
                if (callback) callback();
            }
        },
        ipcMain: {
            handlers: new Map(),
            invoke: jest.fn(async (channel, ...args) => {
                const handler = global.mockElectron.ipcMain.handlers.get(channel);
                if (handler) {
                    return await handler(...args);
                }
                throw new Error(`No handler for channel: ${channel}`);
            }),
            handle: jest.fn((channel, handler) => {
                global.mockElectron.ipcMain.handlers.set(channel, handler);
            })
        }
    };
});

afterEach(() => {
    jest.clearAllTimers();
    if (global.mockElectron) {
        global.mockElectron.globalShortcut.unregisterAll();
        global.mockElectron.ipcMain.handlers.clear();
    }
    jest.clearAllMocks();
});

// Test utilities
global.testUtils = {
    waitForEvent: (emitter, eventName, timeout = 5000) => {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Event '${eventName}' not emitted within ${timeout}ms`));
            }, timeout);

            emitter.once(eventName, (...args) => {
                clearTimeout(timer);
                resolve(args);
            });
        });
    },

    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    generateTestUser: (id = 1) => ({
        BenID: id,
        Vorname: `User${id}`,
        Nachname: `Test${id}`,
        EPC: 53004114 + id - 1,
        Active: 1
    }),

    generateTestSession: (userId = 1, sessionId = 1000) => ({
        ID: sessionId,
        BenID: userId,
        StartTS: new Date(),
        EndTS: null,
        Active: 1,
        ErstelltAm: new Date()
    }),

    generateTestQRScan: (sessionId = 1000, scanId = 2000, payload = 'TEST_QR') => ({
        ID: scanId,
        SessionID: sessionId,
        RawPayload: payload,
        PayloadAsJSON: null,
        CapturedTS: new Date(),
        ScannTS: new Date(),
        ScannTypID: 1,
        Valid: 1,
        ErstelltAm: new Date()
    })
};

// Timeout
jest.setTimeout(30000);