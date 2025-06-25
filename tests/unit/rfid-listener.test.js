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
            await rfidListener.restart();

            expect(rfidListener.isRunning).toBe(true);
            expect(rfidListener.isListening).toBe(true);
        });

        test('should handle multiple start calls', async () => {
            await rfidListener.start();
            await rfidListener.start(); // Should not throw

            expect(rfidListener.isRunning).toBe(true);
        });

        test('should handle stop when not running', async () => {
            await rfidListener.stop(); // Should not throw

            expect(rfidListener.isRunning).toBe(false);
        });
    });

    describe('Tag Detection', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should detect valid tags', (done) => {
            const testTag = '53004114';

            rfidListener.on('tag-detected', (data) => {
                expect(data.tagId).toBe(testTag);
                expect(data.timestamp).toBeDefined();
                done();
            });

            rfidListener.simulateTag(testTag);
        });

        test('should reject invalid tags', (done) => {
            rfidListener.on('invalid-scan', (data) => {
                expect(data.tagId).toBe('INVALID');
                expect(data.reason).toBeDefined();
                done();
            });

            rfidListener.simulateTag('INVALID');
        });

        test('should validate tag length', (done) => {
            let invalidCount = 0;

            rfidListener.on('invalid-scan', (data) => {
                invalidCount++;
                if (invalidCount === 2) {
                    done();
                }
            });

            rfidListener.simulateTag('123'); // Too short
            rfidListener.simulateTag('12345678901234567890123'); // Too long
        });

        test('should validate tag characters', (done) => {
            rfidListener.on('invalid-scan', (data) => {
                expect(data.tagId).toBe('123XYZ');
                expect(data.reason).toContain('Invalid characters');
                done();
            });

            rfidListener.simulateTag('123XYZ'); // Invalid characters
        });

        test('should update statistics correctly', async () => {
            await rfidListener.simulateTag('53004114'); // Valid
            await rfidListener.simulateTag('INVALID');  // Invalid
            await rfidListener.simulateTag('53004115'); // Valid

            const stats = rfidListener.getStats();
            expect(stats.totalScans).toBe(3);
            expect(stats.validScans).toBe(2);
            expect(stats.invalidScans).toBe(1);
            expect(stats.successRate).toBe(67); // 2/3 * 100, rounded
        });
    });

    describe('Input Handling', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should handle character input', () => {
            rfidListener.handleInput('5');
            rfidListener.handleInput('3');
            rfidListener.handleInput('0');
            rfidListener.handleInput('0');
            rfidListener.handleInput('4');
            rfidListener.handleInput('1');
            rfidListener.handleInput('1');
            rfidListener.handleInput('4');

            expect(rfidListener.inputBuffer).toBe('53004114');
        });

        test('should process complete tag on enter', (done) => {
            rfidListener.on('tag-detected', (data) => {
                expect(data.tagId).toBe('53004114');
                done();
            });

            // Simulate typing tag and pressing enter
            '53004114'.split('').forEach(char => {
                rfidListener.handleInput(char);
            });
            rfidListener.handleInput('\r'); // Enter key
        });

        test('should handle buffer timeout', (done) => {
            rfidListener.bufferTimeoutMs = 100; // Very short timeout for test

            rfidListener.on('tag-detected', (data) => {
                expect(data.tagId).toBe('53004114');
                done();
            });

            // Type tag without enter, wait for timeout
            '53004114'.split('').forEach(char => {
                rfidListener.handleInput(char);
            });
        }, 1000);

        test('should clear buffer on complete tag', () => {
            '53004114'.split('').forEach(char => {
                rfidListener.handleInput(char);
            });
            rfidListener.handleInput('\r');

            expect(rfidListener.inputBuffer).toBe('');
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

            let invalidDetected = false;
            rfidListener.on('invalid-scan', () => {
                invalidDetected = true;
            });

            await rfidListener.simulateTag('123456'); // Too short with new config
            expect(invalidDetected).toBe(true);
        });

        test('should get current status', () => {
            const status = rfidListener.getStatus();

            expect(status).toHaveProperty('isRunning');
            expect(status).toHaveProperty('isListening');
            expect(status).toHaveProperty('isHardwareReady');
            expect(status).toHaveProperty('stats');
            expect(status).toHaveProperty('config');
        });
    });

    describe('Auto Scan Feature', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should enable auto scan', () => {
            rfidListener.enableAutoScan(500);

            expect(rfidListener.autoScanEnabled).toBe(true);
            expect(rfidListener.autoScanIntervalMs).toBe(500);
        });

        test('should disable auto scan', () => {
            rfidListener.enableAutoScan(500);
            rfidListener.disableAutoScan();

            expect(rfidListener.autoScanEnabled).toBe(false);
        });

        test('should use custom tags for auto scan', () => {
            const customTags = ['TAG1', 'TAG2', 'TAG3'];
            rfidListener.setMockTags(customTags);

            expect(rfidListener.mockTags).toEqual(customTags);
        });

        test('should auto scan with interval', (done) => {
            let scanCount = 0;

            rfidListener.on('tag-detected', () => {
                scanCount++;
                if (scanCount >= 2) {
                    rfidListener.disableAutoScan();
                    done();
                }
            });

            rfidListener.enableAutoScan(50); // Very fast for test
        }, 1000);
    });

    describe('Hardware Error Simulation', () => {
        test('should simulate hardware errors', (done) => {
            rfidListener.on('error', (error) => {
                expect(error.type).toBe('connection_lost');
                expect(error.message).toContain('connection lost');
                done();
            });

            rfidListener.start().then(() => {
                rfidListener.simulateHardwareError('connection_lost');
            });
        });

        test('should simulate different error types', (done) => {
            const errorTypes = ['connection_lost', 'device_not_found', 'permission_denied', 'timeout'];
            let errorCount = 0;

            rfidListener.on('error', (error) => {
                expect(errorTypes).toContain(error.type);
                errorCount++;
                if (errorCount === errorTypes.length) {
                    done();
                }
            });

            rfidListener.start().then(() => {
                errorTypes.forEach(type => {
                    rfidListener.simulateHardwareError(type);
                });
            });
        }, 2000);

        test('should track error count', async () => {
            await rfidListener.start();

            rfidListener.simulateHardwareError('timeout');
            rfidListener.simulateHardwareError('connection_lost');

            expect(rfidListener.stats.errors).toBe(2);
        });

        test('should emit error events', (done) => {
            rfidListener.on('error', (error) => {
                expect(error).toHaveProperty('type');
                expect(error).toHaveProperty('message');
                expect(error).toHaveProperty('timestamp');
                done();
            });

            rfidListener.start().then(() => {
                rfidListener.simulateHardwareError('device_not_found');
            });
        });

        test('should disable hardware when critical error occurs', async () => {
            await rfidListener.start();

            rfidListener.simulateHardwareError('connection_lost');

            expect(rfidListener.isHardwareReady).toBe(false);
            expect(rfidListener.isListening).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('should handle hardware initialization failure', async () => {
            rfidListener.enableHardwareError();

            await expect(rfidListener.start()).rejects.toThrow('Hardware initialization failed');
        });

        test('should handle simulation errors gracefully', async () => {
            // Should not throw even when not running
            expect(() => {
                rfidListener.simulateHardwareError('timeout');
            }).not.toThrow();
        });

        test('should prevent simulating tags while stopped', async () => {
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

    describe('Cleanup and Destruction', () => {
        test('should destroy listener cleanly', async () => {
            await rfidListener.start();
            rfidListener.enableAutoScan(1000);

            await rfidListener.destroy();

            expect(rfidListener.isRunning).toBe(false);
            expect(rfidListener.autoScanEnabled).toBe(false);
            expect(rfidListener.listenerCount('tag-detected')).toBe(0);
        });

        test('should handle multiple destroys gracefully', async () => {
            await rfidListener.start();
            await rfidListener.destroy();
            await rfidListener.destroy(); // Should not throw

            expect(rfidListener.isRunning).toBe(false);
        });

        test('should cleanup all resources', async () => {
            await rfidListener.start();

            // Add some listeners
            rfidListener.on('test-event', () => {});
            rfidListener.enableAutoScan(1000);

            await rfidListener.destroy();

            expect(rfidListener.registeredShortcuts.length).toBe(0);
            expect(rfidListener.currentBuffer).toBe('');
            expect(rfidListener.inputBuffer).toBe('');
        });
    });

    describe('Global Shortcuts', () => {
        test('should register shortcuts on start', async () => {
            await rfidListener.start();

            expect(global.mockElectron.globalShortcut.register).toHaveBeenCalledWith('F1', expect.any(Function));
            expect(global.mockElectron.globalShortcut.register).toHaveBeenCalledWith('F2', expect.any(Function));
            expect(global.mockElectron.globalShortcut.register).toHaveBeenCalledWith('F3', expect.any(Function));
        });

        test('should trigger tag simulation via shortcuts', (done) => {
            rfidListener.start().then(() => {
                rfidListener.on('tag-detected', (data) => {
                    expect(data.tagId).toBe('53004114');
                    done();
                });

                // Trigger F1 shortcut
                global.mockElectron.globalShortcut.triggerShortcut('F1');
            });
        });

        test('should unregister shortcuts on stop', async () => {
            await rfidListener.start();
            await rfidListener.stop();

            expect(rfidListener.registeredShortcuts.length).toBe(0);
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

        test('should maintain performance history', async () => {
            await rfidListener.start();

            // Generate enough measurements to test history limit
            for (let i = 0; i < 150; i++) {
                await rfidListener.simulateTag(`${50000000 + i}`);
            }

            const stats = rfidListener.getStats();
            expect(stats.performance.processingTimes.length).toBeLessThanOrEqual(100);
        });
    });

    describe('Multiple Tag Simulation', () => {
        test('should simulate multiple tags', async () => {
            await rfidListener.start();

            const tags = ['53004114', '53004115', '53004116'];
            let detectedTags = [];

            rfidListener.on('tag-detected', (data) => {
                detectedTags.push(data.tagId);
            });

            await rfidListener.simulateMultipleTags(tags, 10);

            expect(detectedTags).toEqual(tags);
        });

        test('should handle rapid tag simulation', async () => {
            await rfidListener.start();

            const tags = Array.from({ length: 10 }, (_, i) => `${50000000 + i}`);

            await rfidListener.simulateMultipleTags(tags, 5);

            expect(rfidListener.stats.totalScans).toBe(10);
            expect(rfidListener.stats.validScans).toBe(10);
        }, 2000);
    });
});