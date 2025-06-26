// tests/setup.js
/**
 * Jest Test Setup - Korrigiert
 * Konfiguriert globale Mocks und Test-Umgebung
 */

const { mockElectron } = require('./mocks/electron.mock');

// Mock Electron vollständig
jest.mock('electron', () => mockElectron);

// Speichere originale Console-Methoden
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
};

// Mock console für saubere Test-Ausgabe
console.log = jest.fn();
console.warn = jest.fn();
console.error = jest.fn();

// Globale Electron Mock Setup
global.mockElectron = {
    app: mockElectron.app,
    BrowserWindow: mockElectron.BrowserWindow,
    ipcMain: {
        handle: jest.fn(),
        removeHandler: jest.fn(),
        handlers: new Map(), // handlers richtig initialisieren
        on: jest.fn(),
        removeAllListeners: jest.fn()
    },
    ipcRenderer: mockElectron.ipcRenderer,
    globalShortcut: {
        register: jest.fn(() => true),
        unregister: jest.fn(() => true),
        unregisterAll: jest.fn(),
        shortcuts: new Map()
    },
    dialog: mockElectron.dialog,
    shell: mockElectron.shell,
    nativeTheme: mockElectron.nativeTheme
};

// Mock node-hid mit stabiler Implementierung
jest.mock('node-hid', () => ({
    devices: jest.fn(() => [
        {
            vendorId: 1234,
            productId: 5678,
            path: 'mock-hid-device',
            serialNumber: 'MOCK123',
            manufacturer: 'Mock Manufacturer',
            product: 'Mock RFID Reader',
            release: 256,
            interface: 0,
            usagePage: 1,
            usage: 6
        }
    ]),
    HID: class MockHID {
        constructor(path) {
            this.path = path;
            this.isOpen = true;
        }

        close() {
            this.isOpen = false;
        }

        on(event, callback) {
            // Mock event handling
        }

        write(data) {
            return data.length;
        }

        pause() {
            // Mock pause
        }

        resume() {
            // Mock resume
        }

        read(callback) {
            // Mock read mit Timeout
            setTimeout(() => {
                callback(null, Buffer.from([]));
            }, 10);
        }
    }
}));

// Mock dotenv
jest.mock('dotenv', () => ({
    config: jest.fn(() => {
        // Test-Umgebungsvariablen setzen
        process.env.MSSQL_SERVER = 'localhost';
        process.env.MSSQL_DATABASE = 'RdScanner_Test';
        process.env.MSSQL_USER = 'test_user';
        process.env.MSSQL_PASSWORD = 'test_password';
        process.env.NODE_ENV = 'test';
    })
}));

// Mock mssql für Datenbank-Tests
jest.mock('mssql', () => ({
    connect: jest.fn(() => Promise.resolve({
        request: jest.fn(() => ({
            input: jest.fn().mockReturnThis(),
            query: jest.fn(() => Promise.resolve({ recordset: [] }))
        })),
        close: jest.fn(() => Promise.resolve())
    })),
    ConnectionPool: jest.fn().mockImplementation(() => ({
        connect: jest.fn(() => Promise.resolve()),
        close: jest.fn(() => Promise.resolve()),
        request: jest.fn(() => ({
            input: jest.fn().mockReturnThis(),
            query: jest.fn(() => Promise.resolve({ recordset: [] }))
        }))
    })),
    Request: jest.fn().mockImplementation(() => ({
        input: jest.fn().mockReturnThis(),
        query: jest.fn(() => Promise.resolve({ recordset: [] }))
    })),
    TYPES: {
        Int: 'Int',
        BigInt: 'BigInt',
        VarChar: 'VarChar',
        NVarChar: 'NVarChar',
        DateTime: 'DateTime',
        Bit: 'Bit'
    }
}));

// Global Test Utilities
global.testUtils = {
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    generateRFIDTag: () => {
        const validTags = ['53004114', '53004115', '53004116', '53004117'];
        return validTags[Math.floor(Math.random() * validTags.length)];
    },

    generateUser: (overrides = {}) => ({
        BenID: Math.floor(Math.random() * 1000) + 1,
        Vorname: 'Test',
        Nachname: 'User',
        Email: 'test@example.com',
        EPC: 53004114,
        Active: 1,
        ...overrides
    }),

    generateSession: (overrides = {}) => ({
        ID: Math.floor(Math.random() * 1000) + 1,
        BenID: 1,
        StartTS: new Date(),
        EndTS: null,
        Active: 1,
        ...overrides
    }),

    generateQRScan: (overrides = {}) => ({
        ID: Math.floor(Math.random() * 1000) + 1,
        SessionID: 1,
        RawPayload: `TEST_QR_${Date.now()}`,
        CapturedTS: new Date(),
        Valid: 1,
        ...overrides
    }),

    resetAllMocks: () => {
        jest.clearAllMocks();
        if (global.mockElectron) {
            global.mockElectron.ipcMain.handlers.clear();
            global.mockElectron.globalShortcut.shortcuts.clear();
        }
    },

    logMockState: () => {
        if (process.env.DEBUG_TESTS) {
            originalConsole.log('Mock State:', {
                ipcHandlers: global.mockElectron?.ipcMain?.handlers?.size || 0,
                shortcuts: global.mockElectron?.globalShortcut?.shortcuts?.size || 0
            });
        }
    }
};

// Setup vor jedem Test
beforeEach(() => {
    // Reset process.env
    process.env.NODE_ENV = 'test';

    // Clear all mocks
    jest.clearAllMocks();
    console.log.mockClear();
    console.warn.mockClear();
    console.error.mockClear();

    // Reset global Electron mock state
    if (global.mockElectron) {
        // Sichere Überprüfung und Reset
        if (global.mockElectron.globalShortcut) {
            global.mockElectron.globalShortcut.unregisterAll();
            if (global.mockElectron.globalShortcut.shortcuts) {
                global.mockElectron.globalShortcut.shortcuts.clear();
            }
        }

        // Sichere Überprüfung für ipcMain
        if (global.mockElectron.ipcMain) {
            if (global.mockElectron.ipcMain.handlers) {
                global.mockElectron.ipcMain.handlers.clear();
            }
            if (global.mockElectron.ipcMain.removeAllListeners) {
                global.mockElectron.ipcMain.removeAllListeners();
            }
        }
    }
});

afterEach(() => {
    // Cleanup nach jedem Test
    jest.restoreAllMocks();
    jest.clearAllTimers();

    // Sichere Cleanup für global mocks
    if (global.mockElectron) {
        if (global.mockElectron.globalShortcut && global.mockElectron.globalShortcut.unregisterAll) {
            global.mockElectron.globalShortcut.unregisterAll();
        }

        // Null-safe cleanup für ipcMain
        if (global.mockElectron.ipcMain && global.mockElectron.ipcMain.handlers) {
            global.mockElectron.ipcMain.handlers.clear();
        }
    }
});

afterAll(() => {
    // Console wiederherstellen
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;

    // Finale Cleanup
    delete global.mockElectron;
    delete global.testUtils;
});

// Unhandled Promise Rejections abfangen für Tests
process.on('unhandledRejection', (reason, promise) => {
    // In Tests nur loggen, nicht den Prozess beenden
    if (process.env.NODE_ENV === 'test') {
        console.warn('Unhandled Promise Rejection in Test:', reason);
    }
});

// Uncaught Exceptions abfangen für Tests
process.on('uncaughtException', (error) => {
    // In Tests nur loggen, nicht den Prozess beenden
    if (process.env.NODE_ENV === 'test') {
        console.warn('Uncaught Exception in Test:', error);
    }
});

// Jest Konfiguration
jest.setTimeout(30000); // 30 Sekunden Timeout für Tests

// Export für andere Test-Dateien
module.exports = {
    mockElectron: global.mockElectron,
    testUtils: global.testUtils
};