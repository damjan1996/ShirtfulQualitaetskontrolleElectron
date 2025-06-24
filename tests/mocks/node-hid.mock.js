// tests/mocks/node-hid.mock.js
/**
 * Node-HID Mock für Jest Tests
 * Simuliert RFID-Reader Hardware ohne echte USB-Geräte
 */

const EventEmitter = require('events');

// Mock HID-Geräte
const mockDevices = [
    {
        vendorId: 0x1234,
        productId: 0x5678,
        path: 'USB\\VID_1234&PID_5678\\MOCK_RFID_READER_001',
        serialNumber: 'MOCK001',
        manufacturer: 'Mock RFID Corp',
        product: 'Mock RFID Reader v1.0',
        release: 256,
        interface: 0,
        usagePage: 1,
        usage: 6
    },
    {
        vendorId: 0x2345,
        productId: 0x6789,
        path: 'USB\\VID_2345&PID_6789\\MOCK_RFID_READER_002',
        serialNumber: 'MOCK002',
        manufacturer: 'Test RFID Inc',
        product: 'Test RFID Scanner Pro',
        release: 512,
        interface: 0,
        usagePage: 1,
        usage: 6
    }
];

// Mock RFID-Tags für Simulation
const mockRFIDTags = [
    {
        hex: '53004114',
        decimal: 1392525588,
        user: 'Max Mustermann',
        data: Buffer.from([0x53, 0x00, 0x41, 0x14])
    },
    {
        hex: '12345678',
        decimal: 305419896,
        user: 'Anna Schmidt',
        data: Buffer.from([0x12, 0x34, 0x56, 0x78])
    },
    {
        hex: 'ABCDEF00',
        decimal: 2882400000,
        user: 'Test Benutzer',
        data: Buffer.from([0xAB, 0xCD, 0xEF, 0x00])
    }
];

// Mock HID-Device Klasse
class MockHID extends EventEmitter {
    constructor(path) {
        super();
        this.path = path;
        this.isOpen = false;
        this.isPaused = false;
        this.writeBuffer = [];
        this.readBuffer = [];

        // Simuliere Verbindung nach kurzer Verzögerung
        setTimeout(() => {
            this.isOpen = true;
            this.emit('open');
        }, 10);
    }

    // Device öffnen
    open() {
        if (this.isOpen) {
            throw new Error('Device bereits geöffnet');
        }
        this.isOpen = true;
        this.emit('open');
    }

    // Device schließen
    close() {
        if (!this.isOpen) {
            return;
        }
        this.isOpen = false;
        this.isPaused = false;
        this.emit('close');
        this.removeAllListeners();
    }

    // Daten lesen pausieren
    pause() {
        this.isPaused = true;
    }

    // Daten lesen fortsetzen
    resume() {
        this.isPaused = false;

        // Verarbeite gepufferte Daten
        while (this.readBuffer.length > 0 && !this.isPaused) {
            const data = this.readBuffer.shift();
            this.emit('data', data);
        }
    }

    // Daten an Device senden
    write(data) {
        if (!this.isOpen) {
            throw new Error('Device nicht geöffnet');
        }

        this.writeBuffer.push(data);
        return data.length;
    }

    // Feature Report lesen
    getFeatureReport(reportId, bufferSize) {
        if (!this.isOpen) {
            throw new Error('Device nicht geöffnet');
        }

        // Simuliere Feature Report
        const buffer = Buffer.alloc(bufferSize);
        buffer[0] = reportId;
        return buffer;
    }

    // Feature Report senden
    sendFeatureReport(data) {
        if (!this.isOpen) {
            throw new Error('Device nicht geöffnet');
        }

        return data.length;
    }

    // Simuliere RFID-Tag-Scan
    simulateRFIDScan(tagHex) {
        if (!this.isOpen || this.isPaused) {
            return;
        }

        const tag = mockRFIDTags.find(t => t.hex === tagHex) || {
            hex: tagHex,
            decimal: parseInt(tagHex, 16),
            data: Buffer.from(tagHex, 'hex')
        };

        // Simuliere HID-Keyboard-Input (Tag-ID + Enter)
        const tagData = Buffer.from(tag.hex + '\n', 'ascii');

        if (this.isPaused) {
            this.readBuffer.push(tagData);
        } else {
            this.emit('data', tagData);
        }

        // Simuliere auch 'rfid-tag' Event für erweiterte Tests
        this.emit('rfid-tag', {
            hex: tag.hex,
            decimal: tag.decimal,
            raw: tag.data,
            timestamp: new Date().toISOString()
        });
    }

    // Simuliere Fehler
    simulateError(errorMessage) {
        this.emit('error', new Error(errorMessage));
    }

    // Device-Info abrufen
    getDeviceInfo() {
        const device = mockDevices.find(d => d.path === this.path);
        return device || mockDevices[0];
    }
}

// Geräte-Discovery
const devices = jest.fn(() => {
    return [...mockDevices];
});

// HID-Klassen-Factory
const HID = jest.fn().mockImplementation((path) => {
    return new MockHID(path);
});

// Weitere HID-Funktionen
HID.devices = devices;
HID.setDriverType = jest.fn();

// Test-Helpers für RFID-Simulation
const mockHelpers = {
    // Verfügbare Mock-Tags
    getMockTags: () => [...mockRFIDTags],

    // Neuen Mock-Tag hinzufügen
    addMockTag: (hex, user = 'Test User') => {
        const tag = {
            hex: hex.toUpperCase(),
            decimal: parseInt(hex, 16),
            user,
            data: Buffer.from(hex, 'hex')
        };
        mockRFIDTags.push(tag);
        return tag;
    },

    // Mock-Tags zurücksetzen
    resetMockTags: () => {
        mockRFIDTags.length = 0;
        mockRFIDTags.push(
            {
                hex: '53004114',
                decimal: 1392525588,
                user: 'Max Mustermann',
                data: Buffer.from([0x53, 0x00, 0x41, 0x14])
            }
        );
    },

    // Mock-Geräte aktualisieren
    setMockDevices: (newDevices) => {
        mockDevices.length = 0;
        mockDevices.push(...newDevices);
    },

    // Standard Mock-Geräte wiederherstellen
    resetMockDevices: () => {
        mockDevices.length = 0;
        mockDevices.push(
            {
                vendorId: 0x1234,
                productId: 0x5678,
                path: 'USB\\VID_1234&PID_5678\\MOCK_RFID_READER_001',
                serialNumber: 'MOCK001',
                manufacturer: 'Mock RFID Corp',
                product: 'Mock RFID Reader v1.0',
                release: 256,
                interface: 0,
                usagePage: 1,
                usage: 6
            }
        );
    },

    // HID-Device erstellen (für Tests)
    createMockDevice: (path = 'MOCK_DEVICE') => {
        return new MockHID(path);
    },

    // RFID-Scan simulieren (globale Funktion)
    simulateGlobalRFIDScan: (tagHex, devicePath = null) => {
        // Wenn kein Device-Pfad angegeben, verwende das erste verfügbare
        const targetPath = devicePath || mockDevices[0]?.path;

        if (!targetPath) {
            throw new Error('Kein Mock-Device verfügbar');
        }

        // Simuliere den Scan auf allen aktiven Mock-Devices
        MockHID.activeDevices = MockHID.activeDevices || new Map();

        if (MockHID.activeDevices.has(targetPath)) {
            const device = MockHID.activeDevices.get(targetPath);
            device.simulateRFIDScan(tagHex);
        }
    }
};

// Statische Device-Verwaltung für Tests
MockHID.activeDevices = new Map();

// Override der HID-Konstruktor für Device-Tracking
const originalHID = HID;
const trackedHID = jest.fn().mockImplementation((path) => {
    const device = new MockHID(path);
    MockHID.activeDevices.set(path, device);

    // Cleanup bei Device-Close
    const originalClose = device.close.bind(device);
    device.close = () => {
        MockHID.activeDevices.delete(path);
        originalClose();
    };

    return device;
});

// Eigenschaften übertragen
trackedHID.devices = devices;
trackedHID.setDriverType = jest.fn();

module.exports = {
    // Haupt-Export
    HID: trackedHID,
    devices,

    // Mock-Klassen
    MockHID,

    // Test-Helpers
    __mockHelpers: mockHelpers,
    __mockDevices: mockDevices,
    __mockTags: mockRFIDTags
};