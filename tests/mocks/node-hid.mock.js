// tests/mocks/node-hid.mock.js
/**
 * Node-HID Module Mock für Tests
 * Simuliert USB HID-Geräte (RFID-Reader)
 */

const EventEmitter = require('events');

class MockHID extends EventEmitter {
    constructor(devicePath) {
        super();
        this.devicePath = devicePath;
        this.isOpen = false;
        this.writeBuffer = [];
        this.readBuffer = [];
        this.features = new Map();

        // Simuliere RFID-Reader Eigenschaften
        this.deviceInfo = {
            vendorId: 0x08ff,
            productId: 0x0009,
            path: devicePath,
            serialNumber: 'MOCK_RFID_001',
            manufacturer: 'Mock RFID Corp',
            product: 'Mock RFID Reader v2.1',
            release: 0x0100,
            interface: 0,
            usagePage: 0x0001,
            usage: 0x0006
        };

        // Auto-öffne Gerät
        setTimeout(() => {
            this.isOpen = true;
            this.emit('open');
        }, 10);
    }

    // Schreibt Daten an das HID-Gerät
    write(data) {
        if (!this.isOpen) {
            throw new Error('HID device is not open');
        }

        if (!Buffer.isBuffer(data) && !Array.isArray(data)) {
            throw new Error('Data must be a Buffer or Array');
        }

        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.writeBuffer.push({
            data: buffer,
            timestamp: Date.now()
        });

        // Simuliere erfolgreiches Schreiben
        return buffer.length;
    }

    // Liest Daten vom HID-Gerät (synchron)
    readSync() {
        if (!this.isOpen) {
            throw new Error('HID device is not open');
        }

        if (this.readBuffer.length > 0) {
            return this.readBuffer.shift();
        }

        // Keine Daten verfügbar
        return null;
    }

    // Liest Daten vom HID-Gerät (asynchron)
    read(callback) {
        if (!this.isOpen) {
            callback(new Error('HID device is not open'));
            return;
        }

        setTimeout(() => {
            if (this.readBuffer.length > 0) {
                callback(null, this.readBuffer.shift());
            } else {
                callback(null, null); // Keine Daten
            }
        }, 10);
    }

    // Timeout-basiertes Lesen
    readTimeout(timeoutMs) {
        return new Promise((resolve, reject) => {
            if (!this.isOpen) {
                reject(new Error('HID device is not open'));
                return;
            }

            const timeout = setTimeout(() => {
                resolve(null); // Timeout
            }, timeoutMs);

            const checkData = () => {
                if (this.readBuffer.length > 0) {
                    clearTimeout(timeout);
                    resolve(this.readBuffer.shift());
                } else {
                    setTimeout(checkData, 10);
                }
            };

            checkData();
        });
    }

    // Feature Report senden
    sendFeatureReport(data) {
        if (!this.isOpen) {
            throw new Error('HID device is not open');
        }

        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const reportId = buffer[0];

        this.features.set(reportId, buffer);

        // Simuliere erfolgreiches Senden
        return buffer.length;
    }

    // Feature Report empfangen
    getFeatureReport(reportId, reportLength) {
        if (!this.isOpen) {
            throw new Error('HID device is not open');
        }

        const existingReport = this.features.get(reportId);
        if (existingReport) {
            return existingReport.slice(0, reportLength);
        }

        // Mock-Report generieren
        const mockReport = Buffer.alloc(reportLength);
        mockReport[0] = reportId;

        // Fülle mit Mock-Daten
        for (let i = 1; i < reportLength; i++) {
            mockReport[i] = Math.floor(Math.random() * 256);
        }

        return mockReport;
    }

    // Schließt das HID-Gerät
    close() {
        if (!this.isOpen) {
            return;
        }

        this.isOpen = false;
        this.writeBuffer = [];
        this.readBuffer = [];
        this.features.clear();

        this.emit('close');
    }

    // Event-Handler für eingehende Daten
    on(event, handler) {
        super.on(event, handler);

        // Spezielle Behandlung für 'data' Event
        if (event === 'data') {
            // Simuliere gelegentliche Daten-Events
            this._startDataSimulation();
        }
    }

    // Pausiert das Gerät
    pause() {
        this.emit('pause');
    }

    // Setzt das Gerät fort
    resume() {
        this.emit('resume');
    }

    // Holt Geräteinformationen
    getDeviceInfo() {
        return { ...this.deviceInfo };
    }

    // Test-Helper: Simuliert eingehende RFID-Daten
    simulateRFIDData(tagId) {
        if (!this.isOpen) {
            return false;
        }

        // Konvertiere Tag-ID zu HID-Daten
        const hidData = this._tagIdToHIDData(tagId);

        // Füge zu Read-Buffer hinzu
        this.readBuffer.push(hidData);

        // Emittiere Data-Event
        this.emit('data', hidData);

        return true;
    }

    // Test-Helper: Simuliert Fehler
    simulateError(errorType = 'read_error') {
        const errors = {
            read_error: new Error('Failed to read from HID device'),
            write_error: new Error('Failed to write to HID device'),
            device_disconnected: new Error('HID device disconnected'),
            timeout_error: new Error('HID operation timeout'),
            invalid_report: new Error('Invalid HID report')
        };

        const error = errors[errorType] || new Error('Unknown HID error');
        this.emit('error', error);

        return error;
    }

    // Test-Helper: Setzt Mock-Zustand zurück
    reset() {
        this.writeBuffer = [];
        this.readBuffer = [];
        this.features.clear();
        this.removeAllListeners();
    }

    // Private: Konvertiert Tag-ID zu HID-Daten
    _tagIdToHIDData(tagId) {
        // Simuliere HID-Report-Format für RFID-Reader
        const reportId = 0x01;
        const dataLength = 16;
        const hidReport = Buffer.alloc(dataLength);

        hidReport[0] = reportId;

        // Tag-ID in Hex-Format
        const tagHex = tagId.toString().padEnd(14, '0');
        for (let i = 0; i < Math.min(tagHex.length, 14); i++) {
            hidReport[i + 1] = tagHex.charCodeAt(i);
        }

        // Prüfsumme (einfach)
        hidReport[15] = 0x0D; // Carriage Return

        return hidReport;
    }

    // Private: Startet Daten-Simulation
    _startDataSimulation() {
        if (this._dataSimulationTimer) {
            return;
        }

        this._dataSimulationTimer = setInterval(() => {
            // Gelegentlich zufällige RFID-Daten generieren
            if (Math.random() < 0.1) { // 10% Chance
                const randomTags = ['53004114', '87654321', 'ABCDEF12', '12345678'];
                const randomTag = randomTags[Math.floor(Math.random() * randomTags.length)];
                this.simulateRFIDData(randomTag);
            }
        }, 2000);
    }

    // Cleanup
    destroy() {
        if (this._dataSimulationTimer) {
            clearInterval(this._dataSimulationTimer);
            this._dataSimulationTimer = null;
        }

        this.close();
        this.removeAllListeners();
    }
}

// Mock für HID.devices() Funktion
function mockDevices() {
    return [
        {
            vendorId: 0x08ff,
            productId: 0x0009,
            path: 'mock-hid-device-1',
            serialNumber: 'MOCK_RFID_001',
            manufacturer: 'Mock RFID Corp',
            product: 'Mock RFID Reader v2.1',
            release: 0x0100,
            interface: 0,
            usagePage: 0x0001,
            usage: 0x0006
        },
        {
            vendorId: 0x0461,
            productId: 0x0010,
            path: 'mock-hid-device-2',
            serialNumber: 'MOCK_RFID_002',
            manufacturer: 'Alternative RFID Inc',
            product: 'Alt RFID Scanner Pro',
            release: 0x0200,
            interface: 0,
            usagePage: 0x0001,
            usage: 0x0006
        },
        {
            // Mock für ein anderes HID-Gerät (Tastatur)
            vendorId: 0x046d,
            productId: 0xc52b,
            path: 'mock-keyboard-device',
            serialNumber: 'MOCK_KB_001',
            manufacturer: 'Mock Keyboard Corp',
            product: 'Mock Keyboard',
            release: 0x2900,
            interface: 0,
            usagePage: 0x0001,
            usage: 0x0006
        }
    ];
}

// Mock für HID.setDriverType() Funktion
function mockSetDriverType(type) {
    // Simuliere Driver-Type-Setting
    console.log(`Mock HID: Driver type set to ${type}`);
}

// Factory für Mock HID-Geräte
class MockHIDFactory {
    static createRFIDReader(devicePath = 'mock-rfid-reader') {
        const device = new MockHID(devicePath);

        // RFID-spezifische Konfiguration
        device.deviceInfo.manufacturer = 'RFID Solutions Inc';
        device.deviceInfo.product = 'Professional RFID Reader';
        device.deviceInfo.vendorId = 0x08ff;
        device.deviceInfo.productId = 0x0009;

        return device;
    }

    static createKeyboardEmulator(devicePath = 'mock-keyboard-hid') {
        const device = new MockHID(devicePath);

        // Keyboard-HID-Konfiguration
        device.deviceInfo.manufacturer = 'HID Keyboard Corp';
        device.deviceInfo.product = 'HID Keyboard Emulator';
        device.deviceInfo.vendorId = 0x046d;
        device.deviceInfo.productId = 0xc52b;
        device.deviceInfo.usagePage = 0x0001;
        device.deviceInfo.usage = 0x0006;

        return device;
    }

    static createGenericHID(devicePath = 'mock-generic-hid') {
        return new MockHID(devicePath);
    }
}

// Mock Error Klassen
class MockHIDError extends Error {
    constructor(message, code = 'HID_ERROR') {
        super(message);
        this.name = 'HIDError';
        this.code = code;
    }
}

class MockHIDDeviceNotFoundError extends MockHIDError {
    constructor(devicePath) {
        super(`HID device not found: ${devicePath}`, 'DEVICE_NOT_FOUND');
        this.name = 'HIDDeviceNotFoundError';
    }
}

class MockHIDPermissionError extends MockHIDError {
    constructor() {
        super('Permission denied to access HID device', 'PERMISSION_DENIED');
        this.name = 'HIDPermissionError';
    }
}

// Haupt-Mock-Export
const mockNodeHID = {
    // Haupt-HID-Klasse
    HID: MockHID,

    // Factory-Funktionen
    devices: mockDevices,
    setDriverType: mockSetDriverType,

    // Factory-Klasse
    Factory: MockHIDFactory,

    // Error-Klassen
    HIDError: MockHIDError,
    DeviceNotFoundError: MockHIDDeviceNotFoundError,
    PermissionError: MockHIDPermissionError,

    // Test-Hilfsfunktionen
    resetAllDevices: () => {
        // Reset-Funktion für Tests
    },

    createMockRFIDReader: MockHIDFactory.createRFIDReader,
    createMockKeyboard: MockHIDFactory.createKeyboardEmulator,
    createMockDevice: MockHIDFactory.createGenericHID,

    // Mock-Device-Registry für Tests
    _mockDevices: new Map(),

    registerMockDevice: (path, device) => {
        mockNodeHID._mockDevices.set(path, device);
    },

    unregisterMockDevice: (path) => {
        const device = mockNodeHID._mockDevices.get(path);
        if (device) {
            device.destroy();
            mockNodeHID._mockDevices.delete(path);
        }
    },

    clearMockDevices: () => {
        for (const [path, device] of mockNodeHID._mockDevices) {
            device.destroy();
        }
        mockNodeHID._mockDevices.clear();
    }
};

module.exports = mockNodeHID;