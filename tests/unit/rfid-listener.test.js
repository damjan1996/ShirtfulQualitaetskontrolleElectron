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

        test('should handle restart', async () => {
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

        test('should detect valid RFID tag', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-detected', tagSpy);

            const validTag = '53004114';
            await rfidListener.simulateTag(validTag);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(tagSpy).toHaveBeenCalledWith({
                tagId: validTag,
                timestamp: expect.any(String)
            });
            expect(rfidListener.stats.validScans).toBe(1);
        });

        test('should reject invalid RFID tag', async () => {
            const invalidSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidSpy);

            const invalidTag = 'INVALID!';
            await rfidListener.simulateTag(invalidTag);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(invalidSpy).toHaveBeenCalledWith({
                tagId: invalidTag,
                reason: 'Invalid hex characters',
                timestamp: expect.any(String)
            });
            expect(rfidListener.stats.invalidScans).toBe(1);
        });

        test('should handle empty tag', async () => {
            const invalidSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidSpy);

            await rfidListener.simulateTag('');

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            // Empty tags should be ignored completely
            expect(invalidSpy).not.toHaveBeenCalled();
            expect(rfidListener.stats.totalScans).toBe(0);
        });

        test('should handle tag too short', async () => {
            const invalidSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidSpy);

            await rfidListener.simulateTag('AB');

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(invalidSpy).toHaveBeenCalledWith({
                tagId: 'AB',
                reason: 'Tag ID too short',
                timestamp: expect.any(String)
            });
        });

        test('should handle tag too long', async () => {
            const invalidSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidSpy);

            const longTag = 'A'.repeat(25);
            await rfidListener.simulateTag(longTag);

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(invalidSpy).toHaveBeenCalledWith({
                tagId: longTag,
                reason: 'Tag ID too long',
                timestamp: expect.any(String)
            });
        });
    });

    describe('Tag Validation and Processing', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should emit invalid-scan event for invalid tag', (done) => {
            const invalidTag = 'INVALID!';

            rfidListener.on('invalid-scan', (data) => {
                expect(data.tagId).toBe(invalidTag);
                expect(data.reason).toContain('Invalid hex characters');
                done();
            });

            rfidListener.simulateTag(invalidTag);
        }, 10000);

        test('should process multiple tags sequentially', async () => {
            const tags = ['53004114', '53004115', 'INVALID'];
            const validTags = [];
            const invalidTags = [];

            rfidListener.on('tag-detected', (data) => {
                validTags.push(data.tagId);
            });

            rfidListener.on('invalid-scan', (data) => {
                invalidTags.push(data.tagId);
            });

            // Process tags with delays
            for (const tag of tags) {
                await rfidListener.simulateTag(tag);
                await new Promise(resolve => setTimeout(resolve, 50));
            }

            expect(validTags).toEqual(['53004114', '53004115']);
            expect(invalidTags).toEqual(['INVALID']);
            expect(rfidListener.stats.totalScans).toBe(3);
            expect(rfidListener.stats.validScans).toBe(2);
            expect(rfidListener.stats.invalidScans).toBe(1);
        });
    });

    describe('Manual Input Simulation', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should simulate manual keyboard input', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-detected', tagSpy);

            // Simulate individual key presses
            global.mockElectron.globalShortcut.triggerShortcut('5');
            global.mockElectron.globalShortcut.triggerShortcut('3');
            global.mockElectron.globalShortcut.triggerShortcut('0');
            global.mockElectron.globalShortcut.triggerShortcut('0');
            global.mockElectron.globalShortcut.triggerShortcut('4');
            global.mockElectron.globalShortcut.triggerShortcut('1');
            global.mockElectron.globalShortcut.triggerShortcut('1');
            global.mockElectron.globalShortcut.triggerShortcut('4');
            global.mockElectron.globalShortcut.triggerShortcut('Enter');

            // Wait for processing
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(tagSpy).toHaveBeenCalledWith({
                tagId: '53004114',
                timestamp: expect.any(String)
            });
            expect(rfidListener.stats.totalScans).toBe(1);
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
        test('should handle unhandled promise rejections', (done) => {
            // Setup spy for unhandled rejections
            const originalHandlers = process.listeners('unhandledRejection');
            const rejectionSpy = jest.fn();

            process.removeAllListeners('unhandledRejection');
            process.on('unhandledRejection', rejectionSpy);

            // Trigger an unhandled rejection
            Promise.reject(new Error('Test rejection'));

            // Cleanup after short delay
            setTimeout(() => {
                process.removeAllListeners('unhandledRejection');
                originalHandlers.forEach(handler => {
                    process.on('unhandledRejection', handler);
                });

                // In test environment, rejections should be handled gracefully
                expect(rejectionSpy).toHaveBeenCalled();
                done();
            }, 10);
        });

        test('should handle hardware initialization failure', async () => {
            rfidListener.enableHardwareError();

            await expect(rfidListener.start()).rejects.toThrow('Hardware initialization failed');
            expect(rfidListener.isRunning).toBe(false);
        });

        test('should emit error event on hardware failure', (done) => {
            rfidListener.on('error', (error) => {
                expect(error).toBeInstanceOf(Error);
                expect(error.message).toContain('Hardware initialization failed');
                done();
            });

            rfidListener.enableHardwareError();
            rfidListener.start().catch(() => {});
        });
    });

    describe('Statistics and Performance', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should calculate success rate', async () => {
            // Simulate one valid and one invalid scan
            await rfidListener.simulateTag('53004114');
            await new Promise(resolve => setTimeout(resolve, 25));

            await rfidListener.simulateTag('INVALID');
            await new Promise(resolve => setTimeout(resolve, 25));

            const stats = rfidListener.getStats();

            expect(stats.successRate).toBe(50); // 1 von 2 erfolgreich
        });

        test('should track uptime', async () => {
            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 100));

            const stats = rfidListener.getStats();

            expect(stats.uptime).toBeGreaterThan(0);
            expect(typeof stats.uptime).toBe('number');
        });

        test('should track performance metrics', async () => {
            // Perform some scans to generate performance data
            await rfidListener.simulateTag('53004114');
            await rfidListener.simulateTag('53004115');
            await new Promise(resolve => setTimeout(resolve, 50));

            const stats = rfidListener.getStats();

            expect(stats.performance).toBeDefined();
            expect(stats.performance.avgProcessingTime).toBeGreaterThanOrEqual(0);
            expect(stats.performance.maxProcessingTime).toBeGreaterThanOrEqual(0);
        });

        test('should reset stats correctly', () => {
            rfidListener.stats.totalScans = 5;
            rfidListener.stats.validScans = 3;

            rfidListener._resetStats();

            expect(rfidListener.stats.totalScans).toBe(0);
            expect(rfidListener.stats.validScans).toBe(0);
            expect(rfidListener.stats.successRate).toBe(0);
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
        test('should simulate different error types', () => {
            const errorTypes = ['connection_lost', 'device_not_found', 'permission_denied', 'timeout'];

            errorTypes.forEach(errorType => {
                const error = rfidListener.simulateHardwareError(errorType);
                expect(error).toBeInstanceOf(Error);
                expect(error.message.toLowerCase()).toContain(errorType.replace('_', ' '));
            });
        });

        test('should track error count', () => {
            const initialErrors = rfidListener.stats.errors;

            rfidListener.simulateHardwareError('connection_lost');
            rfidListener.simulateHardwareError('timeout');

            expect(rfidListener.stats.errors).toBe(initialErrors + 2);
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

        test('should remove all event listeners on destroy', async () => {
            const listenerCount = rfidListener.listenerCount('tag-detected');

            rfidListener.on('tag-detected', () => {});
            rfidListener.on('invalid-scan', () => {});

            expect(rfidListener.listenerCount('tag-detected')).toBeGreaterThan(listenerCount);

            await rfidListener.destroy();

            expect(rfidListener.listenerCount('tag-detected')).toBe(0);
            expect(rfidListener.listenerCount('invalid-scan')).toBe(0);
        });

        test('should clear all timeouts and intervals', async () => {
            await rfidListener.start();
            rfidListener.enableAutoScan();

            // Collect active timeouts/intervals
            const initialTimeouts = rfidListener.activeTimeouts.size;
            const initialIntervals = rfidListener.activeIntervals.size;

            await rfidListener.destroy();

            expect(rfidListener.activeTimeouts.size).toBe(0);
            expect(rfidListener.activeIntervals.size).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        test('should handle rapid start/stop cycles', async () => {
            for (let i = 0; i < 5; i++) {
                await rfidListener.start();
                expect(rfidListener.isRunning).toBe(true);

                await rfidListener.stop();
                expect(rfidListener.isRunning).toBe(false);
            }
        });

        test('should handle multiple start calls', async () => {
            await rfidListener.start();
            const firstStartTime = rfidListener.stats.startTime;

            // Second start should be idempotent
            await rfidListener.start();
            expect(rfidListener.stats.startTime).toBe(firstStartTime);
        });

        test('should handle stop when not running', async () => {
            expect(rfidListener.isRunning).toBe(false);

            // Should not throw
            await expect(rfidListener.stop()).resolves.toBeUndefined();
        });

        test('should handle destroy when not running', async () => {
            expect(rfidListener.isRunning).toBe(false);

            // Should not throw
            await expect(rfidListener.destroy()).resolves.toBeUndefined();
        });
    });
});