const MockRFIDListener = require('../mocks/rfid-listener.mock');

describe('SimpleRFIDListener', () => {
    let rfidListener;

    beforeEach(() => {
        // Mock-Electron Global verfügbar machen
        if (!global.mockElectron) {
            global.mockElectron = {
                globalShortcut: {
                    shortcuts: new Map(),
                    register: jest.fn((shortcut, callback) => {
                        if (global.mockElectron.globalShortcut.shortcuts.has(shortcut)) {
                            return false; // Bereits registriert
                        }
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
                        if (callback) {
                            callback();
                        }
                    }
                }
            };
        }

        // Neue Mock-Instanz für jeden Test
        rfidListener = new MockRFIDListener();

        // Debug-Modus für Tests deaktivieren (weniger Console-Output)
        rfidListener.updateConfig({ debugMode: false });

        // Hardware-Fehler deaktivieren (deterministische Tests)
        rfidListener.disableHardwareError();
    });

    afterEach(async () => {
        // Cleanup nach jedem Test
        if (rfidListener.isRunning) {
            await rfidListener.stop();
        }

        // Shortcuts cleanup
        if (global.mockElectron && global.mockElectron.globalShortcut) {
            global.mockElectron.globalShortcut.unregisterAll();
        }

        // Event-Listener entfernen
        rfidListener.removeAllListeners();
    });

    describe('Initialization and Lifecycle', () => {
        test('should initialize correctly', () => {
            expect(rfidListener.isRunning).toBe(false);
            expect(rfidListener.isHardwareReady).toBe(false);
            expect(rfidListener.registeredShortcuts).toEqual([]);
            expect(rfidListener.stats.totalScans).toBe(0);
        });

        test('should start successfully', async () => {
            const startSpy = jest.fn();
            rfidListener.on('started', startSpy);

            await rfidListener.start();

            expect(rfidListener.isRunning).toBe(true);
            expect(rfidListener.isHardwareReady).toBe(true);
            expect(startSpy).toHaveBeenCalled();
            expect(rfidListener.stats.startTime).toBeTruthy();
        });

        test('should not start twice', async () => {
            await rfidListener.start();

            // Zweiter Start sollte keine Änderung bewirken
            await rfidListener.start();

            expect(rfidListener.isRunning).toBe(true);
        });

        test('should stop successfully', async () => {
            const stopSpy = jest.fn();
            rfidListener.on('stopped', stopSpy);

            await rfidListener.start();
            await rfidListener.stop();

            expect(rfidListener.isRunning).toBe(false);
            expect(rfidListener.isHardwareReady).toBe(false);
            expect(stopSpy).toHaveBeenCalled();
        });

        test('should handle hardware initialization failure', async () => {
            const errorSpy = jest.fn();
            rfidListener.on('error', errorSpy);

            // Hardware-Fehler für diesen Test aktivieren
            rfidListener.enableHardwareError();

            await expect(rfidListener.start()).rejects.toThrow('Hardware initialization failed');
            expect(errorSpy).toHaveBeenCalled();
            expect(rfidListener.isRunning).toBe(false);
        });
    });

    describe('RFID Tag Simulation', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should simulate valid RFID tag', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const testTag = '53004114';
            rfidListener.simulateTag(testTag);

            // Kurz warten für asynchrone Verarbeitung
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(tagSpy).toHaveBeenCalledWith(testTag);
            expect(rfidListener.stats.totalScans).toBe(1);
            expect(rfidListener.stats.validScans).toBe(1);
        });

        test('should handle multiple tags', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const testTags = ['53004114', '12345678', 'ABCDEF01'];

            for (const tag of testTags) {
                rfidListener.simulateTag(tag);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            expect(tagSpy).toHaveBeenCalledTimes(testTags.length);
            expect(rfidListener.stats.totalScans).toBe(testTags.length);
            expect(rfidListener.stats.validScans).toBe(testTags.length);
        });

        test('should handle invalid tag sequence input', () => {
            // Test mit falschen Parametern
            expect(() => {
                rfidListener.simulateTagSequence('not-an-array');
            }).toThrow('tagIds must be an array');

            expect(() => {
                rfidListener.simulateTagSequence(null);
            }).toThrow('tagIds must be an array');

            expect(() => {
                rfidListener.simulateTagSequence(undefined);
            }).toThrow('tagIds must be an array');
        });

        test('should simulate tag sequence', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const testTags = ['53004114', '12345678'];

            await rfidListener.simulateTagSequence(testTags, 50); // Kurzes Intervall für Tests

            expect(tagSpy).toHaveBeenCalledTimes(testTags.length);
            expect(rfidListener.stats.totalScans).toBe(testTags.length);
        });

        test('should not simulate when not running', () => {
            // Stoppe den Listener
            rfidListener.stop();

            expect(() => {
                rfidListener.simulateTag('53004114');
            }).toThrow('RFID Listener ist nicht gestartet');
        });

        test('should validate tag parameter type', () => {
            expect(() => {
                rfidListener.simulateTag(123); // Zahl statt String
            }).toThrow('Tag ID muss ein String sein');

            expect(() => {
                rfidListener.simulateTag(null);
            }).toThrow('Tag ID muss ein String sein');
        });
    });

    describe('Tag Validation and Processing', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should emit invalid-scan event for invalid tag', async () => {
            const invalidScanSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidScanSpy);

            const invalidTag = 'INVALID!'; // Enthält ungültiges Zeichen
            rfidListener.simulateTag(invalidTag);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(invalidScanSpy).toHaveBeenCalledWith(invalidTag);
            expect(rfidListener.stats.invalidScans).toBe(1);
            expect(rfidListener.stats.validScans).toBe(0);
        });

        test('should reject too short tags', async () => {
            const invalidScanSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidScanSpy);

            const shortTag = '123'; // Zu kurz (< 6 Zeichen)
            rfidListener.simulateTag(shortTag);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(invalidScanSpy).toHaveBeenCalledWith(shortTag);
            expect(rfidListener.stats.invalidScans).toBe(1);
        });

        test('should reject too long tags', async () => {
            const invalidScanSpy = jest.fn();
            rfidListener.on('invalid-scan', invalidScanSpy);

            const longTag = '1'.repeat(25); // Zu lang (> 20 Zeichen)
            rfidListener.simulateTag(longTag);

            await new Promise(resolve => setTimeout(resolve, 10));

            expect(invalidScanSpy).toHaveBeenCalledWith(longTag);
            expect(rfidListener.stats.invalidScans).toBe(1);
        });

        test('should accept valid hex tags', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const validTags = [
                '123456',
                'ABCDEF',
                '0123456789ABCDEF',
                'abcdef123456' // Lowercase sollte auch funktionieren
            ];

            for (const tag of validTags) {
                rfidListener.simulateTag(tag);
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            expect(tagSpy).toHaveBeenCalledTimes(validTags.length);
            expect(rfidListener.stats.validScans).toBe(validTags.length);
        });
    });

    describe('Statistics and Status', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should track scan statistics', async () => {
            const validTag = '53004114';
            const invalidTag = 'INVALID!';

            rfidListener.simulateTag(validTag);
            await new Promise(resolve => setTimeout(resolve, 10));

            rfidListener.simulateTag(invalidTag);
            await new Promise(resolve => setTimeout(resolve, 10));

            rfidListener.simulateTag(validTag);
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(rfidListener.stats.totalScans).toBe(3);
            expect(rfidListener.stats.validScans).toBe(2);
            expect(rfidListener.stats.invalidScans).toBe(1);
            expect(rfidListener.stats.lastScanTime).toBeTruthy();
        });

        test('should provide status information', () => {
            const status = rfidListener.getStatus();

            expect(status).toHaveProperty('isRunning');
            expect(status).toHaveProperty('isHardwareReady');
            expect(status).toHaveProperty('stats');
            expect(status).toHaveProperty('config');
            expect(status.isRunning).toBe(true);
        });

        test('should reset statistics', async () => {
            rfidListener.simulateTag('53004114');
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(rfidListener.stats.totalScans).toBe(1);

            rfidListener.resetStats();

            expect(rfidListener.stats.totalScans).toBe(0);
            expect(rfidListener.stats.validScans).toBe(0);
            expect(rfidListener.stats.invalidScans).toBe(0);
        });
    });

    describe('Configuration Management', () => {
        test('should update configuration', () => {
            const newConfig = {
                minTagLength: 8,
                maxTagLength: 16,
                debugMode: true
            };

            rfidListener.updateConfig(newConfig);

            const status = rfidListener.getStatus();
            expect(status.config.minTagLength).toBe(8);
            expect(status.config.maxTagLength).toBe(16);
            expect(status.config.debugMode).toBe(true);
        });

        test('should toggle debug mode', () => {
            const initialDebugMode = rfidListener.config.debugMode;

            rfidListener.toggleDebugMode();

            expect(rfidListener.config.debugMode).toBe(!initialDebugMode);

            rfidListener.toggleDebugMode();

            expect(rfidListener.config.debugMode).toBe(initialDebugMode);
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
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const mockGlobalShortcut = global.mockElectron.globalShortcut;

            await rfidListener.start();

            // Simuliere Shortcut-Trigger für Tag "53"
            mockGlobalShortcut.triggerShortcut('5');
            mockGlobalShortcut.triggerShortcut('3');
            mockGlobalShortcut.triggerShortcut('0');
            mockGlobalShortcut.triggerShortcut('0');
            mockGlobalShortcut.triggerShortcut('4');
            mockGlobalShortcut.triggerShortcut('1');
            mockGlobalShortcut.triggerShortcut('1');
            mockGlobalShortcut.triggerShortcut('4');
            mockGlobalShortcut.triggerShortcut('Enter');

            // Warte auf Verarbeitung
            await new Promise(resolve => setTimeout(resolve, 50));

            expect(tagSpy).toHaveBeenCalledWith('53004114');
            expect(rfidListener.stats.totalScans).toBe(1);
        });

        test('should handle missing electron mock gracefully', async () => {
            // Temporär global mock entfernen
            const originalMock = global.mockElectron;
            delete global.mockElectron;

            // Neue Instanz ohne Mock
            const listenerWithoutMock = new MockRFIDListener();
            listenerWithoutMock.updateConfig({ debugMode: false });
            listenerWithoutMock.disableHardwareError();

            // Sollte ohne Fehler starten
            await expect(listenerWithoutMock.start()).resolves.toBeUndefined();
            expect(listenerWithoutMock.isRunning).toBe(true);
            expect(listenerWithoutMock.registeredShortcuts.length).toBe(0);

            await listenerWithoutMock.stop();

            // Mock wiederherstellen
            global.mockElectron = originalMock;
        });
    });

    describe('Error Handling', () => {
        test('should handle unhandled promise rejections', () => {
            // Setup Spy für unhandled rejections
            const originalHandler = process.listeners('unhandledRejection');
            const rejectionSpy = jest.fn();

            process.removeAllListeners('unhandledRejection');
            process.on('unhandledRejection', rejectionSpy);

            // Trigger eine unhandled rejection
            Promise.reject(new Error('Test rejection'));

            // Cleanup
            setTimeout(() => {
                process.removeAllListeners('unhandledRejection');
                originalHandler.forEach(handler => {
                    process.on('unhandledRejection', handler);
                });
            }, 10);
        });

        test('should handle errors in event listeners', async () => {
            const errorSpy = jest.fn();
            rfidListener.on('error', errorSpy);

            await rfidListener.start();

            // Event-Listener der einen Fehler wirft
            rfidListener.on('tag-scanned', () => {
                throw new Error('Test error in listener');
            });

            // Sollte den Fehler nicht zum Absturz führen
            expect(() => {
                rfidListener.simulateTag('53004114');
            }).not.toThrow();
        });
    });

    describe('Performance Tests', () => {
        beforeEach(async () => {
            await rfidListener.start();
        });

        test('should handle rapid successive scans', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const rapidTags = Array(10).fill().map((_, i) => `5300411${i}`);

            // Simuliere sehr schnelle Scans
            for (const tag of rapidTags) {
                rfidListener.simulateTag(tag);
            }

            // Warte auf Verarbeitung aller Tags
            await new Promise(resolve => setTimeout(resolve, 100));

            expect(tagSpy).toHaveBeenCalledTimes(rapidTags.length);
            expect(rfidListener.stats.totalScans).toBe(rapidTags.length);
        });

        test('should handle continuous simulation', async () => {
            const tagSpy = jest.fn();
            rfidListener.on('tag-scanned', tagSpy);

            const testTags = ['53004114', '12345678'];

            rfidListener.startSimulation(testTags, 100); // Sehr kurzes Intervall

            // Lasse Simulation kurz laufen
            await new Promise(resolve => setTimeout(resolve, 350));

            rfidListener._stopSimulation();

            // Sollte mindestens ein paar Tags gescannt haben
            expect(tagSpy).toHaveBeenCalled();
            expect(rfidListener.stats.totalScans).toBeGreaterThan(0);
        });
    });
});