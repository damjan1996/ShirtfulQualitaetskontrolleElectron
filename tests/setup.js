// tests/setup.js
/**
 * Jest Test Setup - Korrigiert
 * Konfiguriert globale Mocks und Test-Umgebung
 */

const { mockElectron } = require('./mocks/electron.mock');

// Mock Electron vollständig
jest.mock('electron', () => mockElectron);

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

        read(callback) {
            // Mock read with empty data
            setTimeout(() => callback(null, Buffer.alloc(0)), 10);
        }
    }
}));

// Mock mssql für Datenbank-Tests
jest.mock('mssql', () => ({
    ConnectionPool: class MockConnectionPool {
        constructor(config) {
            this.config = config;
            this.connected = false;
        }

        async connect() {
            this.connected = true;
            return this;
        }

        async close() {
            this.connected = false;
        }

        request() {
            return new MockRequest();
        }
    },
    Request: class MockRequest {
        input(name, value) {
            return this;
        }

        async query(sql) {
            return {
                recordset: [],
                rowsAffected: [0]
            };
        }
    },
    TYPES: {
        Int: 'int',
        VarChar: 'varchar',
        DateTime: 'datetime',
        Bit: 'bit'
    }
}));

// Console-Output für Tests reduzieren
global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Jest Timeout Configuration
jest.setTimeout(30000);

// Cleanup zwischen Tests
afterEach(() => {
    // Mock Electron State zurücksetzen
    if (global.mockElectron) {
        global.mockElectron.globalShortcut.unregisterAll();
        if (global.mockElectron.ipcMain.handlers) {
            global.mockElectron.ipcMain.handlers.clear();
        }
    }
    jest.clearAllMocks();
});

// Environment Variables für Tests
process.env.NODE_ENV = 'test';
process.env.DB_SERVER = 'localhost';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Suppress specific warnings in test environment
const originalConsoleWarn = console.warn;
console.warn = (message, ...args) => {
    // Filter out specific warnings that are expected in test environment
    if (typeof message === 'string' &&
        (message.includes('Electron Security Warning') ||
            message.includes('node-hid') ||
            message.includes('native module'))) {
        return;
    }
    originalConsoleWarn(message, ...args);
};

// Mock fetch für Web APIs
global.fetch = jest.fn(() =>
    Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('')
    })
);

// Mock Worker for QR scanning
global.Worker = class MockWorker {
    constructor(stringUrl) {
        this.url = stringUrl;
        this.onmessage = null;
        this.onerror = null;
    }

    postMessage(message) {
        // Mock worker response
        setTimeout(() => {
            if (this.onmessage) {
                this.onmessage({ data: { success: true } });
            }
        }, 10);
    }

    terminate() {
        // Mock termination
    }
};

// Mock MediaDevices für QR-Scanner
Object.defineProperty(global.navigator, 'mediaDevices', {
    writable: true,
    value: {
        getUserMedia: jest.fn(() => Promise.resolve({
            getTracks: () => [{
                stop: jest.fn()
            }]
        })),
        enumerateDevices: jest.fn(() => Promise.resolve([
            {
                deviceId: 'mock-camera',
                groupId: 'mock-group',
                kind: 'videoinput',
                label: 'Mock Camera'
            }
        ]))
    }
});

// Performance Mock für Performance-Tests
global.performance = {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn()
};

// Globale Test-Utilities
global.testUtils = {
    waitFor: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    mockDelay: (ms = 10) => new Promise(resolve => setTimeout(resolve, ms)),

    createMockEvent: (type, data = {}) => ({
        type,
        timestamp: Date.now(),
        ...data
    }),

    createMockUser: (id = 1) => ({
        BenID: id,
        Vorname: 'Test',
        Nachname: 'User',
        Email: `test${id}@example.com`,
        EPC: 53004113 + id,
        Active: 1
    }),

    createMockSession: (userId = 1, sessionId = null) => ({
        ID: sessionId || Math.floor(Math.random() * 10000) + 1000,
        BenID: userId,
        StartTS: new Date().toISOString(),
        EndTS: null,
        Active: 1
    })
};

// Debugging für Failed Tests
const originalIt = global.it;
global.it = (name, fn, timeout) => {
    return originalIt(name, async (...args) => {
        try {
            await fn(...args);
        } catch (error) {
            console.error(`❌ Test failed: ${name}`);
            console.error('Error:', error.message);
            if (error.stack) {
                console.error('Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
            }
            throw error;
        }
    }, timeout);
};

console.log('✅ Test-Setup vollständig geladen');