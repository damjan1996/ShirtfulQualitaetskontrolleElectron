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

        test('should initialize with correct default config', () => {
            expect(rfidListener.config.inputTimeout).toBe(200);
            expect(rfidListener.config.maxBufferLength).toBe(15);
            expect(rfidListener.config.enableLogging).toBe(false);
            expect(rfidListener.config.enableStats).toBe(true);
        });

        test('should initialize with default mock tags', () => {
            expect(rfidListener.mockTags).toBeDefined();
            expect(rfidListener.mockTags.length).toBeGreaterThan(0);
            expect(rfidListener.mockTags).toContain('53004114');
            expect(rfidListener.mockTags).toContain('87654321');
        });

        test('should initialize duplicate detection', () => {
            expect(rfidListener.duplicateDetection.enabled).toBe(true);
            expect(rfidListener.duplicateDetection.timeWindow).toBe(1000);
            expect(rfidListener.duplicateDetection.recentScans).toBeInstanceOf(Map);
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
            expect(rfidListener.registeredShortcuts.length).toBe(0);
        });

        test('should stop when not listening', async () => {
            const result = await rfidListener.stop();

            expect(result).toBe(true);
            expect(rfidListener.isListening).toBe(false);
        });

        test('should emit start and stop events', async () => {
            const startHandler = jest.fn();
            const stopHandler = jest.fn();

            rfidListener.on('started', startHandler);
            rfidListener.on('stopped', stopHandler);

            await rfidListener.start();
            await rfidListener.stop();

            expect(startHandler).toHaveBeenCalled();
            expect(stopHandler).toHaveBeenCalled();
        });

        test('should handle start errors gracefully', async () => {
            const errorHandler = jest.fn();
            rfidListener.on('error', errorHandler);

            // Mock einen Start-Fehler
            jest.spyOn(rfidListener, '_initializeHardware')
                .mockRejectedValueOnce(new Error('Hardware initialization failed'));

            const result = await rfidListener.start();

            expect(result).toBe(false);
            expect(rfidListener.isListening).toBe(false);
            expect(errorHandler).toHaveBeenCalled();
        });
    });

    describe('Configuration Management', () => {
        test('should set callback correctly', () => {
            const newCallback = jest.fn();
            rfidListener.setCallback(newCallback);

            expect(rfidListener.callback).toBe(newCallback);
        });

        test('should update configuration', () => {
            const newConfig = {
                inputTimeout: 500,
                enableLogging: true,
                maxBufferLength: 20
            };

            rfidListener.setConfig(newConfig);

            expect(rfidListener.config.inputTimeout).toBe(500);
            expect(rfidListener.config.enableLogging).toBe(true);
            expect(rfidListener.config.maxBufferLength).toBe(20);
        });

        test('should merge configuration correctly', () => {
            const originalTimeout = rfidListener.config.inputTimeout;

            rfidListener.setConfig({ enableLogging: true });

            expect(rfidListener.config.inputTimeout).toBe(originalTimeout);
            expect(rfidListener.config.enableLogging).toBe(true);
        });

        test('should set minimum scan interval', () => {
            const newInterval = 500;
            rfidListener.setMinScanInterval(newInterval);

            expect(rfidListener.minScanInterval).toBe(newInterval);
        });
    });

    describe('RFID Tag Simulation', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should simulate valid RFID tag', () => {
            const tagId = '53004114';
            const result = rfidListener.simulateTag(tagId);

            expect(result).toBe(true);
        });

        test('should not simulate when not listening', async () => {
            await rfidListener.stop();
            const result = rfidListener.simulateTag('53004114');

            expect(result).toBe(false);
        });

        test('should respect minimum scan interval', () => {
            rfidListener.setMinScanInterval(100);

            const result1 = rfidListener.simulateTag('53004114');
            const result2 = rfidListener.simulateTag('87654321'); // Zu schnell

            expect(result1).toBe(true);
            expect(result2).toBe(false);
        });

        test('should allow scan after minimum interval', async () => {
            rfidListener.setMinScanInterval(50);

            rfidListener.simulateTag('53004114');

            // Warte ab
            await new Promise(resolve => setTimeout(resolve, 60));

            const result = rfidListener.simulateTag('87654321');
            expect(result).toBe(true);
        });

        test('should simulate tag sequence', async () => {
            const tags = ['53004114', '87654321', 'ABCDEF12'];
            const sequencePromise = rfidListener.simulateTagSequence(tags, 100);

            await sequencePromise;

            expect(rfidListener.stats.totalScans).toBe(3);
        });

        test('should handle invalid tag sequence input', async () => {
            await expect(rfidListener.simulateTagSequence('not-an-array'))
                .rejects.toThrow('tagIds must be an array');
        });
    });

    describe('Tag Validation and Processing', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should emit tag-scanned event for valid tag', (done) => {
            const tagId = '53004114';

            rfidListener.on('tag-scanned', (data) => {
                expect(data.tagId).toBe(tagId);
                expect(data.timestamp).toBeDefined();
                done();
            });

            rfidListener.simulateTag(tagId);
        });

        test('should emit invalid-scan event for invalid tag', (done) => {
            const invalidTag = 'INVALID!';

            rfidListener.on('invalid-scan', (data) => {
                expect(data.tagId).toBe(invalidTag);
                expect(data.reason).toContain('Invalid hex characters');
                done();
            });

            rfidListener.simulateTag(invalidTag);
        });

        test('should call callback for valid scans', (done) => {
            const tagId = '53004114';

            rfidListener.setCallback((scannedTagId) => {
                expect(scannedTagId).toBe(tagId);
                done();
            });

            rfidListener.simulateTag(tagId);
        });

        test('should not call callback for invalid scans', (done) => {
            const invalidTag = 'INVALID!';
            const validTag = '53004114';

            let callCount = 0;
            rfidListener.setCallback((tagId) => {
                callCount++;
                expect(tagId).toBe(validTag);
            });

            rfidListener.simulateTag(invalidTag);
            setTimeout(() => {
                rfidListener.simulateTag(validTag);
                setTimeout(() => {
                    expect(callCount).toBe(1);
                    done();
                }, 50);
            }, 50);
        });

        test('should handle callback errors gracefully', (done) => {
            const errorHandler = jest.fn();
            rfidListener.on('callback-error', errorHandler);

            rfidListener.setCallback(() => {
                throw new Error('Callback error');
            });

            rfidListener.simulateTag('53004114');

            setTimeout(() => {
                expect(errorHandler).toHaveBeenCalled();
                done();
            }, 100);
        });

        test('should validate tag length', () => {
            const tooShort = '12';
            const tooLong = '1234567890ABCDEF123';
            const validTag = '53004114';

            expect(rfidListener._validateTag(tooShort).isValid).toBe(false);
            expect(rfidListener._validateTag(tooLong).isValid).toBe(false);
            expect(rfidListener._validateTag(validTag).isValid).toBe(true);
        });

        test('should validate hex characters', () => {
            const invalidChars = '53G04114';
            const validHex = '53004114';

            expect(rfidListener._validateTag(invalidChars).isValid).toBe(false);
            expect(rfidListener._validateTag(validHex).isValid).toBe(true);
        });

        test('should handle null and undefined tags', () => {
            expect(rfidListener._validateTag(null).isValid).toBe(false);
            expect(rfidListener._validateTag(undefined).isValid).toBe(false);
            expect(rfidListener._validateTag('').isValid).toBe(false);
        });
    });

    describe('Duplicate Detection', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should detect duplicate scans', (done) => {
            const tagId = '53004114';

            rfidListener.on('duplicate-scan', (data) => {
                expect(data.tagId).toBe(tagId);
                done();
            });

            rfidListener.simulateTag(tagId);
            setTimeout(() => {
                rfidListener.simulateTag(tagId); // Duplicate
            }, 50);
        });

        test('should allow duplicate after time window', async () => {
            const tagId = '53004114';
            rfidListener.setDuplicateDetection(true, 100); // 100ms window

            rfidListener.simulateTag(tagId);

            // Warte länger als Time Window
            await new Promise(resolve => setTimeout(resolve, 150));

            const duplicateHandler = jest.fn();
            rfidListener.on('duplicate-scan', duplicateHandler);

            rfidListener.simulateTag(tagId);

            // Warte kurz und überprüfe
            await new Promise(resolve => setTimeout(resolve, 50));
            expect(duplicateHandler).not.toHaveBeenCalled();
        });

        test('should disable duplicate detection', (done) => {
            const tagId = '53004114';
            rfidListener.setDuplicateDetection(false);

            const duplicateHandler = jest.fn();
            rfidListener.on('duplicate-scan', duplicateHandler);

            rfidListener.simulateTag(tagId);
            setTimeout(() => {
                rfidListener.simulateTag(tagId);
                setTimeout(() => {
                    expect(duplicateHandler).not.toHaveBeenCalled();
                    done();
                }, 50);
            }, 50);
        });

        test('should check if scan is duplicate', () => {
            const tagId = '53004114';

            // Erste Scan
            rfidListener.duplicateDetection.recentScans.set(tagId, Date.now());

            expect(rfidListener.isDuplicateScan(tagId)).toBe(true);
            expect(rfidListener.isDuplicateScan('87654321')).toBe(false);
        });

        test('should respect duplicate time window', () => {
            const tagId = '53004114';
            rfidListener.setDuplicateDetection(true, 100);

            // Füge alten Scan hinzu
            rfidListener.duplicateDetection.recentScans.set(tagId, Date.now() - 200);

            expect(rfidListener.isDuplicateScan(tagId)).toBe(false);
        });
    });

    describe('Statistics and Performance', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should track scan statistics', () => {
            rfidListener.simulateTag('53004114'); // Valid
            rfidListener.simulateTag('87654321'); // Valid
            rfidListener.simulateTag('INVALID!'); // Invalid

            const stats = rfidListener.getStats();

            expect(stats.totalScans).toBe(3);
            expect(stats.validScans).toBe(2);
            expect(stats.invalidScans).toBe(1);
            expect(stats.isListening).toBe(true);
        });

        test('should calculate scan rate', () => {
            const stats = rfidListener.getStats();

            expect(stats.scanRate).toBeDefined();
            expect(typeof stats.scanRate).toBe('number');
            expect(stats.scanRate).toBeGreaterThanOrEqual(0);
        });

        test('should calculate success rate', () => {
            rfidListener.simulateTag('53004114'); // Valid
            rfidListener.simulateTag('INVALID!'); // Invalid

            const stats = rfidListener.getStats();

            expect(stats.successRate).toBe(50); // 1 von 2 erfolgreich
        });

        test('should track uptime', () => {
            const stats = rfidListener.getStats();

            expect(stats.uptime).toBeGreaterThan(0);
            expect(typeof stats.uptime).toBe('number');
        });

        test('should clear statistics', () => {
            rfidListener.simulateTag('53004114');
            rfidListener.clearStats();

            const stats = rfidListener.getStats();

            expect(stats.totalScans).toBe(0);
            expect(stats.validScans).toBe(0);
            expect(stats.invalidScans).toBe(0);
        });

        test('should track performance metrics', () => {
            rfidListener.simulateTag('53004114');

            const stats = rfidListener.getStats();

            expect(stats.performance).toBeDefined();
            expect(stats.performance.avgProcessingTime).toBeGreaterThanOrEqual(0);
            expect(stats.performance.maxProcessingTime).toBeGreaterThanOrEqual(0);
        });

        test('should maintain scan history', () => {
            rfidListener.simulateTag('53004114');
            rfidListener.simulateTag('87654321');

            const history = rfidListener.getScanHistory();

            expect(history.length).toBe(2);
            expect(history[0].tagId).toBe('53004114');
            expect(history[1].tagId).toBe('87654321');
            expect(history.every(scan => scan.timestamp instanceof Date)).toBe(true);
        });

        test('should limit scan history size', () => {
            // Simuliere viele Scans
            for (let i = 0; i < 150; i++) {
                rfidListener.simulateTag('53004114');
            }

            const history = rfidListener.getScanHistory();

            expect(history.length).toBeLessThanOrEqual(100);
        });
    });

    describe('Auto Scan Feature', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should enable auto scan', () => {
            rfidListener.enableAutoScan(1000);

            expect(rfidListener.autoScanEnabled).toBe(true);
            expect(rfidListener.autoScanDelay).toBe(1000);
        });

        test('should disable auto scan', () => {
            rfidListener.enableAutoScan(1000);
            rfidListener.disableAutoScan();

            expect(rfidListener.autoScanEnabled).toBe(false);
        });

        test('should perform auto scans', (done) => {
            let scanCount = 0;

            rfidListener.on('tag-scanned', () => {
                scanCount++;
                if (scanCount >= 2) {
                    rfidListener.disableAutoScan();
                    expect(scanCount).toBeGreaterThanOrEqual(2);
                    done();
                }
            });

            rfidListener.enableAutoScan(100); // Sehr kurzes Intervall für Test
        });

        test('should use mock tags for auto scan', (done) => {
            const customTags = ['AAAA', 'BBBB', 'CCCC'];
            rfidListener.setMockTags(customTags);

            const scannedTags = [];

            rfidListener.on('tag-scanned', (data) => {
                scannedTags.push(data.tagId);
                if (scannedTags.length >= 3) {
                    rfidListener.disableAutoScan();
                    expect(scannedTags).toEqual(customTags);
                    done();
                }
            });

            rfidListener.enableAutoScan(50);
        });
    });

    describe('Mock Tag Management', () => {
        test('should set mock tags', () => {
            const newTags = ['AAAA', 'BBBB', 'CCCC'];
            rfidListener.setMockTags(newTags);

            expect(rfidListener.mockTags).toEqual(newTags);
            expect(rfidListener.currentMockIndex).toBe(0);
        });

        test('should add mock tag', () => {
            const originalCount = rfidListener.mockTags.length;
            rfidListener.addMockTag('NEWTAG');

            expect(rfidListener.mockTags.length).toBe(originalCount + 1);
            expect(rfidListener.mockTags).toContain('NEWTAG');
        });

        test('should cycle through mock tags', () => {
            rfidListener.setMockTags(['AAA', 'BBB', 'CCC']);

            expect(rfidListener.getNextMockTag()).toBe('AAA');
            expect(rfidListener.getNextMockTag()).toBe('BBB');
            expect(rfidListener.getNextMockTag()).toBe('CCC');
            expect(rfidListener.getNextMockTag()).toBe('AAA'); // Cycle back
        });

        test('should handle empty mock tags', () => {
            rfidListener.setMockTags([]);

            expect(rfidListener.getNextMockTag()).toBe('53004114'); // Default
        });
    });

    describe('Hardware Error Simulation', () => {
        test('should simulate hardware errors', () => {
            const errorHandler = jest.fn();
            rfidListener.on('hardware-error', errorHandler);

            const error = rfidListener.simulateHardwareError('connection_lost');

            expect(error).toBeInstanceOf(Error);
            expect(error.message).toContain('connection lost');
            expect(errorHandler).toHaveBeenCalledWith(error);
        });

        test('should simulate different error types', () => {
            const errorTypes = [
                'connection_lost',
                'device_not_found',
                'permission_denied',
                'hardware_malfunction',
                'buffer_overflow'
            ];

            errorTypes.forEach(errorType => {
                const error = rfidListener.simulateHardwareError(errorType);
                expect(error).toBeInstanceOf(Error);
                expect(error.message.toLowerCase()).toContain(errorType.replace('_', ' '));
            });
        });

        test('should simulate buffer overflow', () => {
            const overflowHandler = jest.fn();
            rfidListener.on('buffer-overflow', overflowHandler);

            rfidListener.simulateBufferOverflow();

            expect(overflowHandler).toHaveBeenCalled();
            expect(rfidListener.buffer).toBe(''); // Buffer should be cleared
        });

        test('should handle unknown error type', () => {
            const error = rfidListener.simulateHardwareError('unknown_error');

            expect(error.message).toContain('Unknown hardware error');
        });
    });

    describe('Buffer Management', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should get current buffer', () => {
            rfidListener.buffer = 'TEST123';

            expect(rfidListener.getCurrentBuffer()).toBe('TEST123');
        });

        test('should clear buffer manually', () => {
            rfidListener.buffer = 'TEST123';
            rfidListener.clearBuffer();

            expect(rfidListener.getCurrentBuffer()).toBe('');
        });

        test('should handle buffer overflow', () => {
            const overflowHandler = jest.fn();
            rfidListener.on('buffer-overflow', overflowHandler);

            // Fülle Buffer über Limit
            rfidListener.buffer = 'X'.repeat(rfidListener.config.maxBufferLength + 1);
            rfidListener._processBufferOverflow();

            expect(overflowHandler).toHaveBeenCalled();
            expect(rfidListener.buffer).toBe('');
            expect(rfidListener.stats.bufferOverflows).toBe(1);
        });

        test('should validate hex characters', () => {
            expect(rfidListener._isValidHexChar('A')).toBe(true);
            expect(rfidListener._isValidHexChar('5')).toBe(true);
            expect(rfidListener._isValidHexChar('F')).toBe(true);
            expect(rfidListener._isValidHexChar('G')).toBe(false);
            expect(rfidListener._isValidHexChar('!')).toBe(false);
        });
    });

    describe('Cleanup and Destruction', () => {
        test('should destroy listener cleanly', async () => {
            await rfidListener.start();
            rfidListener.enableAutoScan(1000);

            rfidListener.destroy();

            expect(rfidListener.isListening).toBe(false);
            expect(rfidListener.autoScanEnabled).toBe(false);
            expect(rfidListener.stats.totalScans).toBe(0);
        });

        test('should remove all event listeners on destroy', () => {
            const testHandler = jest.fn();
            rfidListener.on('tag-scanned', testHandler);
            rfidListener.on('error', testHandler);

            rfidListener.destroy();

            // Versuche Events zu emittieren - sollten nicht mehr gehört werden
            rfidListener.emit('tag-scanned', { tagId: 'TEST' });
            rfidListener.emit('error', new Error('Test'));

            expect(testHandler).not.toHaveBeenCalled();
        });

        test('should clear all timers on stop', async () => {
            await rfidListener.start();
            rfidListener.enableAutoScan(1000);

            await rfidListener.stop();

            expect(rfidListener.autoScanInterval).toBeNull();
            expect(rfidListener.inputTimer).toBeNull();
        });
    });

    describe('Factory Methods', () => {
        test('should create USB HID listener', () => {
            const { MockRFIDListenerFactory } = require('../mocks/rfid-listener.mock');
            const callback = jest.fn();

            const listener = MockRFIDListenerFactory.createUSBHIDListener(callback, {
                enableLogging: true
            });

            expect(listener).toBeInstanceOf(MockRFIDListener);
            expect(listener.callback).toBe(callback);
            expect(listener.config.enableLogging).toBe(true);
            expect(listener.config.inputTimeout).toBe(200);
            expect(listener.config.maxBufferLength).toBe(15);
        });

        test('should create serial listener', () => {
            const { MockRFIDListenerFactory } = require('../mocks/rfid-listener.mock');
            const callback = jest.fn();

            const listener = MockRFIDListenerFactory.createSerialListener(callback);

            expect(listener).toBeInstanceOf(MockRFIDListener);
            expect(listener.config.inputTimeout).toBe(500);
            expect(listener.config.maxBufferLength).toBe(20);
            expect(listener.minScanInterval).toBe(300);
        });

        test('should create network listener', () => {
            const { MockRFIDListenerFactory } = require('../mocks/rfid-listener.mock');
            const callback = jest.fn();

            const listener = MockRFIDListenerFactory.createNetworkListener(callback);

            expect(listener).toBeInstanceOf(MockRFIDListener);
            expect(listener.config.inputTimeout).toBe(1000);
            expect(listener.config.maxBufferLength).toBe(25);
            expect(listener.minScanInterval).toBe(500);
        });
    });

    describe('Integration with Mock Environment', () => {
        test('should work with global electron mock', async () => {
            expect(global.mockElectron).toBeDefined();
            expect(global.mockElectron.globalShortcut).toBeDefined();

            await rfidListener.start();

            // RFID Listener sollte mit Electron Mock interagieren können
            expect(rfidListener.registeredShortcuts.length).toBeGreaterThan(0);
        });

        test('should handle electron shortcut registration', async () => {
            const mockGlobalShortcut = global.mockElectron.globalShortcut;
            const registerSpy = jest.spyOn(mockGlobalShortcut, 'register');

            await rfidListener.start();

            // Überprüfe dass Shortcuts registriert wurden
            expect(registerSpy).toHaveBeenCalled();
            expect(mockGlobalShortcut.shortcuts.size).toBeGreaterThan(0);
        });

        test('should trigger shortcuts via mock', async () => {
            const mockGlobalShortcut = global.mockElectron.globalShortcut;

            await rfidListener.start();

            // Simuliere Shortcut-Trigger
            mockGlobalShortcut.triggerShortcut('5');
            mockGlobalShortcut.triggerShortcut('3');
            mockGlobalShortcut.triggerShortcut('Enter');

            // Warte auf Verarbeitung
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(rfidListener.stats.totalScans).toBeGreaterThan(0);
        });
    });
});