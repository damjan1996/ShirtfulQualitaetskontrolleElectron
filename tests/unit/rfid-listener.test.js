// tests/unit/rfid-listener.test.js
/**
 * Unit Tests für RFID Listener
 */

const MockRFIDListener = require('../mocks/rfid-listener.mock');

// Mock Electron Global Shortcuts
jest.mock('electron', () => global.mockElectron);

describe('SimpleRFIDListener', () => {
    let rfidListener;
    let mockCallback;

    beforeEach(() => {
        mockCallback = jest.fn();
        rfidListener = new MockRFIDListener(mockCallback);
    });

    afterEach(async () => {
        if (rfidListener && rfidListener.isListening) {
            await rfidListener.stop();
        }
    });

    describe('Initialization', () => {
        test('should initialize with default values', () => {
            const listener = new MockRFIDListener();

            expect(listener.isListening).toBe(false);
            expect(listener.buffer).toBe('');
            expect(listener.registeredShortcuts).toEqual([]);
            expect(listener.stats).toBeDefined();
            expect(listener.stats.totalScans).toBe(0);
        });

        test('should initialize with callback', () => {
            const callback = jest.fn();
            const listener = new MockRFIDListener(callback);

            expect(listener.callback).toBe(callback);
        });
    });

    describe('Start/Stop Operations', () => {
        test('should start successfully', async () => {
            const result = await rfidListener.start();

            expect(result).toBe(true);
            expect(rfidListener.isListening).toBe(true);
            expect(rfidListener.registeredShortcuts.length).toBeGreaterThan(0);
        });

        test('should not start if already listening', async () => {
            await rfidListener.start();
            const isListening1 = rfidListener.isListening;

            await rfidListener.start();
            const isListening2 = rfidListener.isListening;

            expect(isListening1).toBe(true);
            expect(isListening2).toBe(true);
        });

        test('should stop successfully', async () => {
            await rfidListener.start();
            await rfidListener.stop();

            expect(rfidListener.isListening).toBe(false);
            expect(rfidListener.registeredShortcuts).toEqual([]);
            expect(rfidListener.buffer).toBe('');
        });

        test('should handle stop when not listening', async () => {
            expect(rfidListener.isListening).toBe(false);
            await rfidListener.stop();
            expect(rfidListener.isListening).toBe(false);
        });
    });

    describe('Input Handling', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should handle hex character input', () => {
            const hexChars = '0123456789ABCDEF';

            for (const char of hexChars) {
                rfidListener.handleInput(char);
            }

            expect(rfidListener.buffer).toBe(hexChars);
        });

        test('should convert lowercase to uppercase', () => {
            rfidListener.handleInput('a');
            rfidListener.handleInput('b');
            rfidListener.handleInput('c');

            expect(rfidListener.buffer).toBe('ABC');
        });

        test('should accumulate buffer correctly', () => {
            const sequence = '53004114';

            for (const char of sequence) {
                rfidListener.handleInput(char);
            }

            expect(rfidListener.buffer).toBe(sequence);
        });

        test('should handle empty input gracefully', () => {
            rfidListener.handleInput('');
            expect(rfidListener.buffer).toBe('');
        });
    });

    describe('Tag Processing', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should process valid tag correctly', () => {
            const tagId = '53004114';
            rfidListener.buffer = tagId;
            rfidListener.processTag();

            expect(mockCallback).toHaveBeenCalledWith(tagId);
            expect(rfidListener.buffer).toBe('');
            expect(rfidListener.stats.validScans).toBe(1);
        });

        test('should reject invalid tag', () => {
            const invalidTag = 'INVALID';
            rfidListener.buffer = invalidTag;
            rfidListener.processTag();

            expect(mockCallback).not.toHaveBeenCalled();
            expect(rfidListener.stats.invalidScans).toBe(1);
        });

        test('should handle empty buffer', () => {
            rfidListener.buffer = '';
            rfidListener.processTag();

            expect(mockCallback).not.toHaveBeenCalled();
        });

        test('should clear buffer after processing', () => {
            rfidListener.buffer = '53004114';
            rfidListener.processTag();

            expect(rfidListener.buffer).toBe('');
        });
    });

    describe('Tag Validation', () => {
        test('should validate correct hex tags', () => {
            const validTags = [
                '53004114',
                'ABCDEF01',
                '12345678',
                '87654321',
                'DEADBEEF'
            ];

            validTags.forEach(tag => {
                expect(rfidListener.validateTag(tag)).toBe(true);
            });
        });

        test('should reject invalid tags', () => {
            const invalidTags = [
                '', // Leer
                'G', // Ungültiges Hex-Zeichen
                '123', // Zu kurz
                '123456789012345', // Zu lang
                '00000000', // Null-Wert
                'GHIJKLMN', // Ungültige Hex-Zeichen
                null,
                undefined
            ];

            invalidTags.forEach(tag => {
                expect(rfidListener.validateTag(tag)).toBe(false);
            });
        });

        test('should handle different tag lengths', () => {
            const validLengths = ['123456', '12345678', '1234567890AB'];
            const invalidLengths = ['12345', '123456789012345'];

            validLengths.forEach(tag => {
                expect(rfidListener.validateTag(tag)).toBe(true);
            });

            invalidLengths.forEach(tag => {
                expect(rfidListener.validateTag(tag)).toBe(false);
            });
        });
    });

    describe('Simulation Functions', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should simulate tag successfully', () => {
            const tagId = '53004114';
            const result = rfidListener.simulateTag(tagId);

            expect(result).toBe(true);
            expect(mockCallback).toHaveBeenCalledWith(tagId);
        });

        test('should reject invalid tag simulation', () => {
            const invalidTag = 'INVALID';
            const result = rfidListener.simulateTag(invalidTag);

            expect(result).toBe(false);
            expect(mockCallback).not.toHaveBeenCalled();
        });

        test('should not simulate when not listening', async () => {
            await rfidListener.stop();
            const result = rfidListener.simulateTag('53004114');

            expect(result).toBe(false);
            expect(mockCallback).not.toHaveBeenCalled();
        });

        test('should simulate key sequence', () => {
            const sequence = '53004114';
            rfidListener.simulateKeySequence(sequence);

            expect(mockCallback).toHaveBeenCalledWith(sequence);
        });
    });

    describe('Status Information', () => {
        test('should return correct status when not listening', () => {
            const status = rfidListener.getStatus();

            expect(status.listening).toBe(false);
            expect(status.deviceConnected).toBe(true);
            expect(status.buffer).toBe('');
            expect(status.type).toBe('mock-keyboard');
            expect(status.stats).toBeDefined();
        });

        test('should return correct status when listening', async () => {
            await rfidListener.start();
            const status = rfidListener.getStatus();

            expect(status.listening).toBe(true);
            expect(status.registeredShortcuts).toBeGreaterThan(0);
        });

        test('should track statistics correctly', async () => {
            await rfidListener.start();

            // Simuliere mehrere Scans
            rfidListener.simulateTag('53004114');
            rfidListener.simulateTag('87654321');
            rfidListener.simulateTag('INVALID'); // Ungültig

            const status = rfidListener.getStatus();

            expect(status.stats.totalScans).toBe(3);
            expect(status.stats.validScans).toBe(2);
            expect(status.stats.invalidScans).toBe(1);
            expect(status.stats.successRate).toBeCloseTo(66.67, 1);
        });
    });

    describe('Buffer Management', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should clear buffer manually', () => {
            rfidListener.buffer = 'TEST123';
            rfidListener.clearBuffer();

            expect(rfidListener.buffer).toBe('');
        });

        test('should handle buffer overflow gracefully', () => {
            // Buffer über Maximum füllen
            const longInput = 'A'.repeat(20);

            for (const char of longInput) {
                rfidListener.handleInput(char);
            }

            // Buffer sollte begrenzt sein
            expect(rfidListener.buffer.length).toBeLessThanOrEqual(15);
        });
    });

    describe('Statistics Management', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should reset statistics', () => {
            // Füge einige Statistiken hinzu
            rfidListener.simulateTag('53004114');
            rfidListener.simulateTag('87654321');

            expect(rfidListener.stats.totalScans).toBeGreaterThan(0);

            // Reset
            rfidListener.resetStats();

            expect(rfidListener.stats.totalScans).toBe(0);
            expect(rfidListener.stats.validScans).toBe(0);
            expect(rfidListener.stats.invalidScans).toBe(0);
        });

        test('should calculate success rate correctly', async () => {
            // 3 gültige, 2 ungültige Scans
            rfidListener.simulateTag('53004114');
            rfidListener.simulateTag('87654321');
            rfidListener.simulateTag('ABCDEF01');

            // Ungültige Tags
            rfidListener.buffer = 'INVALID1';
            rfidListener.processTag();
            rfidListener.buffer = 'INVALID2';
            rfidListener.processTag();

            const status = rfidListener.getStatus();
            expect(status.stats.successRate).toBeCloseTo(60, 1); // 3/5 = 60%
        });
    });

    describe('Error Handling', () => {
        test('should handle callback errors gracefully', async () => {
            const errorCallback = jest.fn().mockImplementation(() => {
                throw new Error('Callback error');
            });

            const listener = new MockRFIDListener(errorCallback);
            await listener.start();

            // Sollte nicht werfen
            expect(() => {
                listener.simulateTag('53004114');
            }).not.toThrow();

            expect(errorCallback).toHaveBeenCalled();
        });

        test('should handle null callback', async () => {
            const listener = new MockRFIDListener(null);
            await listener.start();

            expect(() => {
                listener.simulateTag('53004114');
            }).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should handle rapid input correctly', () => {
            const rapidInput = '53004114';
            const startTime = Date.now();

            // Simuliere sehr schnelle Eingabe
            for (let i = 0; i < 100; i++) {
                for (const char of rapidInput) {
                    rfidListener.handleInput(char);
                }
                rfidListener.processTag();
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(1000); // Sollte unter 1 Sekunde sein
            expect(rfidListener.stats.totalScans).toBe(100);
        });

        test('should maintain performance with many shortcuts', async () => {
            const startTime = Date.now();

            // Teste Status-Abfrage Performance
            for (let i = 0; i < 1000; i++) {
                rfidListener.getStatus();
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            expect(duration).toBeLessThan(100); // Sollte unter 100ms sein
        });
    });

    describe('Edge Cases', () => {
        test('should handle special characters in tag', () => {
            // Sollte nur Hex-Zeichen akzeptieren
            const specialChars = '!@#$%^&*()';

            for (const char of specialChars) {
                rfidListener.handleInput(char);
            }

            // Buffer sollte leer bleiben
            expect(rfidListener.buffer).toBe('');
        });

        test('should handle unicode characters', () => {
            const unicodeChars = 'äöü日本語🎉';

            for (const char of unicodeChars) {
                rfidListener.handleInput(char);
            }

            // Buffer sollte leer bleiben
            expect(rfidListener.buffer).toBe('');
        });

        test('should handle concurrent tag processing', async () => {
            const promises = [];

            for (let i = 0; i < 10; i++) {
                promises.push(new Promise(resolve => {
                    rfidListener.simulateTag('5300411' + i);
                    resolve();
                }));
            }

            await Promise.all(promises);

            // Mindestens einige Scans sollten erfolgreich sein
            expect(rfidListener.stats.validScans).toBeGreaterThan(0);
        });
    });
});