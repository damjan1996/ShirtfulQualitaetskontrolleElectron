// tests/unit/rfid-listener.test.js
/**
 * RFID Listener Unit Tests - Korrigiert
 * Testet MockRFIDListener Funktionalität vollständig
 */

const MockRFIDListener = require('../mocks/rfid-listener.mock');

describe('SimpleRFIDListener', () => {
    let rfidListener;

    beforeEach(async () => {
        // Ensure clean global state
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
            }
        };

        rfidListener = new MockRFIDListener();
        rfidListener.updateConfig({ debugMode: false });
        rfidListener.disableHardwareError();
    });

    afterEach(async () => {
        if (rfidListener && rfidListener.isRunning) {
            await rfidListener.destroy();
        }
        global.mockElectron.globalShortcut.unregisterAll();
        jest.clearAllMocks();
    });

    describe('Basic Functionality', () => {
        test('should initialize correctly', () => {
            expect(rfidListener).toBeDefined();
            expect(rfidListener.isRunning).toBe(false);
            expect(rfidListener.isListening).toBe(false);
            expect(rfidListener.stats.totalScans).toBe(0);
        });

        test('should start successfully', async () => {
            await rfidListener.start();

            expect(rfidListener.isRunning).toBe(true);
            expect(rfidListener.isListening).toBe(true);
            expect(rfidListener.stats.startTime).toBeTruthy();
        });

        test('should stop successfully', async () => {
            await rfidListener.start();
            await rfidListener.stop();

            expect(rfidListener.isRunning).toBe(false);
            expect(rfidListener.isListening).toBe(false);
        });

        test('should handle restart correctly', async () => {
            await rfidListener.start();
            await rfidListener.stop();
            await rfidListener.start();

            expect(rfidListener.isRunning).toBe(true);
            expect(rfidListener.isListening).toBe(true);
        });
    });

    describe('Tag Detection', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should detect valid tags', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-detected', tagSpy);

            await rfidListener.simulateTag('53004114');

            expect(tagSpy).toHaveBeenCalledWith({
                tagId: '53004114',
                timestamp: expect.any(String)
            });
            expect(rfidListener.stats.totalScans).toBe(1);
            expect(rfidListener.stats.validScans).toBe(1);
        });

        test('should reject invalid tags', async () => {
            const invalidSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidSpy);

            await rfidListener.simulateTag('INVALID');

            expect(invalidSpy).toHaveBeenCalledWith({
                tagId: 'INVALID',
                reason: expect.any(String),
                timestamp: expect.any(String)
            });
            expect(rfidListener.stats.invalidScans).toBe(1);
        });

        test('should track statistics correctly', async () => {
            await rfidListener.simulateTag('53004114'); // Valid
            await rfidListener.simulateTag('INVALID'); // Invalid
            await rfidListener.simulateTag('53004115'); // Valid

            expect(rfidListener.stats.totalScans).toBe(3);
            expect(rfidListener.stats.validScans).toBe(2);
            expect(rfidListener.stats.invalidScans).toBe(1);
            expect(rfidListener.stats.successRate).toBe(67);
        });

        test('should handle simultaneous tag detection', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-detected', tagSpy);

            const promises = [
                rfidListener.simulateTag('53004114'),
                rfidListener.simulateTag('53004115'),
                rfidListener.simulateTag('53004116')
            ];

            await Promise.all(promises);

            expect(tagSpy).toHaveBeenCalledTimes(3);
            expect(rfidListener.stats.totalScans).toBe(3);
        });
    });

    describe('Auto Scan Feature', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should enable and disable auto scan', () => {
            expect(rfidListener.autoScanEnabled).toBe(false);

            rfidListener.enableAutoScan(100);
            expect(rfidListener.autoScanEnabled).toBe(true);

            rfidListener.disableAutoScan();
            expect(rfidListener.autoScanEnabled).toBe(false);
        });

        test('should use mock tags for auto scan', (done) => {
            const customTags = ['AAAA', 'BBBB', 'CCCC'];
            rfidListener.setMockTags(customTags);

            const scannedTags = [];

            rfidListener.on('tag-detected', (data) => {
                scannedTags.push(data.tagId);
                if (scannedTags.length >= 3) {
                    rfidListener.disableAutoScan();
                    expect(scannedTags).toEqual(customTags);
                    done();
                }
            });

            rfidListener.enableAutoScan(50);
        }, 10000);

        test('should cycle through tags correctly', (done) => {
            const tags = ['TAG1', 'TAG2'];
            rfidListener.setMockTags(tags);

            const scannedTags = [];
            let scanCount = 0;

            rfidListener.on('tag-detected', (data) => {
                scannedTags.push(data.tagId);
                scanCount++;

                if (scanCount >= 4) { // Should cycle through twice
                    rfidListener.disableAutoScan();
                    expect(scannedTags).toEqual(['TAG1', 'TAG2', 'TAG1', 'TAG2']);
                    done();
                }
            });

            rfidListener.enableAutoScan(50);
        }, 10000);
    });

    describe('Hardware Error Simulation', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should simulate different error types', (done) => {
            const errorTypes = ['connection_lost', 'device_not_found', 'permission_denied', 'timeout'];
            let errorCount = 0;

            rfidListener.on('error', (error) => {
                expect(error).toBeInstanceOf(Error);
                expect(error.message.toLowerCase()).toContain(error.type.replace('_', ' '));

                errorCount++;
                if (errorCount === errorTypes.length) {
                    expect(rfidListener.stats.errors).toBe(errorTypes.length);
                    done();
                }
            });

            errorTypes.forEach(errorType => {
                const error = rfidListener.simulateHardwareError(errorType);
                expect(error).toBeInstanceOf(Error);
                expect(error.type).toBe(errorType);
            });
        });

        test('should track error count', (done) => {
            const initialErrors = rfidListener.stats.errors;
            let errorCount = 0;

            rfidListener.on('error', () => {
                errorCount++;
                if (errorCount === 2) {
                    expect(rfidListener.stats.errors).toBe(initialErrors + 2);
                    done();
                }
            });

            rfidListener.simulateHardwareError('connection_lost');
            rfidListener.simulateHardwareError('timeout');
        });

        test('should emit error events', (done) => {
            rfidListener.on('error', (error) => {
                expect(error.type).toBe('connection_lost');
                expect(error.message).toContain('connection lost');
                done();
            });

            rfidListener.simulateHardwareError('connection_lost');
        });
    });

    describe('Configuration', () => {
        test('should update configuration', () => {
            const newConfig = {
                minTagLength: 8,
                maxTagLength: 16,
                debugMode: true
            };

            rfidListener.updateConfig(newConfig);

            expect(rfidListener.config.minTagLength).toBe(8);
            expect(rfidListener.config.maxTagLength).toBe(16);
            expect(rfidListener.config.debugMode).toBe(true);
        });

        test('should validate tags according to config', async () => {
            await rfidListener.start();

            rfidListener.updateConfig({ minTagLength: 10 });

            const invalidSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidSpy);

            await rfidListener.simulateTag('SHORT');
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(invalidSpy).toHaveBeenCalledWith({
                tagId: 'SHORT',
                reason: 'Tag ID too short',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Cleanup and Destruction', () => {
        test('should destroy listener cleanly', async () => {
            await rfidListener.start();
            rfidListener.enableAutoScan();

            await rfidListener.destroy();

            expect(rfidListener.isRunning).toBe(false);
            expect(rfidListener.isListening).toBe(false);
            expect(rfidListener.autoScanEnabled).toBe(false);
            expect(rfidListener.stats.totalScans).toBe(0);
        });

        test('should handle multiple destroys gracefully', async () => {
            await rfidListener.start();

            await rfidListener.destroy();
            await rfidListener.destroy(); // Should not throw

            expect(rfidListener.isRunning).toBe(false);
        });
    });

    describe('Global Shortcuts', () => {
        test('should register shortcuts on start', async () => {
            await rfidListener.start();

            expect(global.mockElectron.globalShortcut.register).toHaveBeenCalled();
            expect(rfidListener.registeredShortcuts.length).toBeGreaterThan(0);
        });

        test('should unregister shortcuts on stop', async () => {
            await rfidListener.start();
            const shortcutCount = rfidListener.registeredShortcuts.length;

            await rfidListener.stop();

            expect(global.mockElectron.globalShortcut.unregister).toHaveBeenCalledTimes(shortcutCount);
            expect(rfidListener.registeredShortcuts.length).toBe(0);
        });

        test('should trigger scan on shortcut', async () => {
            await rfidListener.start();

            const tagSpy = jest.fn();
            rfidListener.on('tag-detected', tagSpy);

            // Trigger F1 shortcut
            global.mockElectron.globalShortcut.triggerShortcut('F1');

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(tagSpy).toHaveBeenCalledWith({
                tagId: expect.stringMatching(/^SHORTCUT_F1_\d+$/),
                timestamp: expect.any(String)
            });
        });

        test('should handle missing electron mock gracefully', async () => {
            // Temporarily remove global mock
            const originalMock = global.mockElectron;
            delete global.mockElectron;

            // New instance without mock
            const listenerWithoutMock = new MockRFIDListener();
            listenerWithoutMock.updateConfig({ debugMode: false });
            listenerWithoutMock.disableHardwareError();

            // Should start without errors
            await expect(listenerWithoutMock.start()).resolves.toBeUndefined();
            expect(listenerWithoutMock.isRunning).toBe(true);
            expect(listenerWithoutMock.registeredShortcuts.length).toBe(0);

            await listenerWithoutMock.stop();

            // Restore mock
            global.mockElectron = originalMock;
        });
    });

    describe('Error Handling', () => {
        test('should handle hardware initialization failure', async () => {
            rfidListener.enableHardwareError();

            await expect(rfidListener.start()).rejects.toThrow('Hardware initialization failed');
            expect(rfidListener.isRunning).toBe(false);
        });

        test('should handle simulation errors gracefully', async () => {
            await rfidListener.start();

            // Should not throw when simulating tags while stopped
            await rfidListener.stop();

            await expect(rfidListener.simulateTag('53004114')).rejects.toThrow('RFID Listener is not running');
        });

        test('should reset statistics properly', async () => {
            await rfidListener.start();

            // Generate some statistics
            await rfidListener.simulateTag('53004114');
            await rfidListener.simulateTag('INVALID');

            expect(rfidListener.stats.totalScans).toBeGreaterThan(0);

            rfidListener.resetStatistics();

            expect(rfidListener.stats.totalScans).toBe(0);
            expect(rfidListener.stats.validScans).toBe(0);
            expect(rfidListener.stats.invalidScans).toBe(0);
            expect(rfidListener.stats.errors).toBe(0);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track performance metrics', async () => {
            await rfidListener.start();

            await rfidListener.simulateTag('53004114');
            await rfidListener.simulateTag('53004115');

            const stats = rfidListener.getStatistics();

            expect(stats.performance.avgProcessingTime).toBeGreaterThan(0);
            expect(stats.performance.maxProcessingTime).toBeGreaterThan(0);
            expect(stats.performance.processingTimes.length).toBe(2);
        });

        test('should calculate success rate correctly', async () => {
            await rfidListener.start();

            // 3 valid, 1 invalid = 75% success rate
            await rfidListener.simulateTag('53004114'); // Valid
            await rfidListener.simulateTag('53004115'); // Valid
            await rfidListener.simulateTag('INVALID');  // Invalid
            await rfidListener.simulateTag('53004116'); // Valid

            expect(rfidListener.stats.successRate).toBe(75);
        });

        test('should track uptime correctly', async () => {
            await rfidListener.start();

            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = rfidListener.getStatistics();
            expect(stats.uptime).toBeGreaterThan(0);
        });
    });
});