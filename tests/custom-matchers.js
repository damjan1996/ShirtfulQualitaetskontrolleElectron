/**
 * Custom Jest Matchers für RFID QR System Tests
 * Erweiterte Assertions für domänen-spezifische Validierungen
 */

expect.extend({
    /**
     * Prüft ob ein Wert ein gültiger RFID-Tag ist
     */
    toBeValidRFIDTag(received) {
        const isString = typeof received === 'string';
        const hasValidLength = received && received.length >= 6 && received.length <= 20;
        const isHexadecimal = /^[0-9A-Fa-f]+$/.test(received);
        const isValid = isString && hasValidLength && isHexadecimal;

        return {
            message: () => {
                if (!isString) {
                    return `Expected RFID tag to be a string, but received ${typeof received}`;
                }
                if (!hasValidLength) {
                    return `Expected RFID tag to be 6-20 characters long, but received ${received.length} characters: "${received}"`;
                }
                if (!isHexadecimal) {
                    return `Expected RFID tag to contain only hexadecimal characters (0-9, A-F), but received: "${received}"`;
                }
                return `Expected ${received} to be a valid RFID tag`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein Wert ein gültiger QR-Code ist
     */
    toBeValidQRCode(received) {
        const isString = typeof received === 'string';
        const hasContent = received && received.length > 0;
        const isValid = isString && hasContent;

        return {
            message: () => {
                if (!isString) {
                    return `Expected QR code to be a string, but received ${typeof received}`;
                }
                if (!hasContent) {
                    return `Expected QR code to have content, but received empty string`;
                }
                return `Expected ${received} to be a valid QR code`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein Objekt eine gültige Session ist
     */
    toBeValidSession(received) {
        const isObject = received && typeof received === 'object' && !Array.isArray(received);
        const hasId = typeof received?.id === 'number' && received.id > 0;
        const hasUserId = typeof received?.userId === 'number' && received.userId > 0;
        const hasStartTime = received?.startTime instanceof Date;
        const hasValidActiveFlag = typeof received?.active === 'boolean';

        const isValid = isObject && hasId && hasUserId && hasStartTime && hasValidActiveFlag;

        return {
            message: () => {
                if (!isObject) {
                    return `Expected session to be an object, but received ${typeof received}`;
                }
                if (!hasId) {
                    return `Expected session to have a valid id (positive number), but received: ${received.id}`;
                }
                if (!hasUserId) {
                    return `Expected session to have a valid userId (positive number), but received: ${received.userId}`;
                }
                if (!hasStartTime) {
                    return `Expected session to have a valid startTime (Date object), but received: ${typeof received.startTime}`;
                }
                if (!hasValidActiveFlag) {
                    return `Expected session to have a valid active flag (boolean), but received: ${typeof received.active}`;
                }
                return `Expected ${JSON.stringify(received)} to be a valid session object`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein Objekt ein gültiger User ist
     */
    toBeValidUser(received) {
        const isObject = received && typeof received === 'object' && !Array.isArray(received);
        const hasId = typeof received?.id === 'number' && received.id > 0;
        const hasName = typeof received?.name === 'string' && received.name.length > 0;
        const hasEPC = typeof received?.epc === 'string' && received.epc.length >= 6;

        const isValid = isObject && hasId && hasName && hasEPC;

        return {
            message: () => {
                if (!isObject) {
                    return `Expected user to be an object, but received ${typeof received}`;
                }
                if (!hasId) {
                    return `Expected user to have a valid id (positive number), but received: ${received.id}`;
                }
                if (!hasName) {
                    return `Expected user to have a valid name (non-empty string), but received: ${received.name}`;
                }
                if (!hasEPC) {
                    return `Expected user to have a valid epc (string with 6+ characters), but received: ${received.epc}`;
                }
                return `Expected ${JSON.stringify(received)} to be a valid user object`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein Objekt ein gültiger QR-Scan ist
     */
    toBeValidQRScan(received) {
        const isObject = received && typeof received === 'object' && !Array.isArray(received);
        const hasId = typeof received?.id === 'number' && received.id > 0;
        const hasSessionId = typeof received?.sessionId === 'number' && received.sessionId > 0;
        const hasQRData = typeof received?.qrData === 'string' && received.qrData.length > 0;
        const hasScanTime = received?.scanTime instanceof Date;

        const isValid = isObject && hasId && hasSessionId && hasQRData && hasScanTime;

        return {
            message: () => {
                if (!isObject) {
                    return `Expected QR scan to be an object, but received ${typeof received}`;
                }
                if (!hasId) {
                    return `Expected QR scan to have a valid id (positive number), but received: ${received.id}`;
                }
                if (!hasSessionId) {
                    return `Expected QR scan to have a valid sessionId (positive number), but received: ${received.sessionId}`;
                }
                if (!hasQRData) {
                    return `Expected QR scan to have valid qrData (non-empty string), but received: ${received.qrData}`;
                }
                if (!hasScanTime) {
                    return `Expected QR scan to have a valid scanTime (Date object), but received: ${typeof received.scanTime}`;
                }
                return `Expected ${JSON.stringify(received)} to be a valid QR scan object`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob eine Database-Verbindung gültig ist
     */
    toBeConnectedDatabase(received) {
        const isObject = received && typeof received === 'object';
        const isConnected = received?.isConnected === true;
        const hasConnectionState = typeof received?.connectionState === 'string';

        const isValid = isObject && isConnected && hasConnectionState;

        return {
            message: () => {
                if (!isObject) {
                    return `Expected database to be an object, but received ${typeof received}`;
                }
                if (!isConnected) {
                    return `Expected database to be connected (isConnected: true), but received: ${received.isConnected}`;
                }
                if (!hasConnectionState) {
                    return `Expected database to have a connectionState string, but received: ${typeof received.connectionState}`;
                }
                return `Expected database to be connected`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein RFID-Listener läuft
     */
    toBeRunningRFIDListener(received) {
        const isObject = received && typeof received === 'object';
        const isRunning = received?.isRunning === true;
        const isHardwareReady = received?.isHardwareReady === true;
        const hasStats = received?.stats && typeof received.stats === 'object';

        const isValid = isObject && isRunning && isHardwareReady && hasStats;

        return {
            message: () => {
                if (!isObject) {
                    return `Expected RFID listener to be an object, but received ${typeof received}`;
                }
                if (!isRunning) {
                    return `Expected RFID listener to be running (isRunning: true), but received: ${received.isRunning}`;
                }
                if (!isHardwareReady) {
                    return `Expected RFID listener hardware to be ready (isHardwareReady: true), but received: ${received.isHardwareReady}`;
                }
                if (!hasStats) {
                    return `Expected RFID listener to have stats object, but received: ${typeof received.stats}`;
                }
                return `Expected RFID listener to be running and ready`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob eine Electron-IPC-Verbindung verfügbar ist
     */
    toHaveIPCChannel(received, channelName) {
        const hasElectron = global.mockElectron && typeof global.mockElectron === 'object';
        const hasIpcMain = hasElectron && global.mockElectron.ipcMain;
        const hasChannel = hasIpcMain && global.mockElectron.ipcMain.hasHandler &&
            global.mockElectron.ipcMain.hasHandler(channelName);

        const isValid = hasElectron && hasIpcMain && hasChannel;

        return {
            message: () => {
                if (!hasElectron) {
                    return `Expected global mockElectron to be available`;
                }
                if (!hasIpcMain) {
                    return `Expected mockElectron.ipcMain to be available`;
                }
                if (!hasChannel) {
                    return `Expected IPC channel "${channelName}" to be registered, but it was not found`;
                }
                return `Expected IPC channel "${channelName}" to be available`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein Wert innerhalb eines bestimmten Zeitbereichs liegt
     */
    toBeWithinTimeRange(received, expectedTime, toleranceMs = 1000) {
        const isDate = received instanceof Date;
        const expectedDate = expectedTime instanceof Date ? expectedTime : new Date(expectedTime);
        const timeDiff = isDate ? Math.abs(received.getTime() - expectedDate.getTime()) : Infinity;
        const isWithinRange = isDate && timeDiff <= toleranceMs;

        return {
            message: () => {
                if (!isDate) {
                    return `Expected received value to be a Date object, but received ${typeof received}`;
                }
                return `Expected ${received.toISOString()} to be within ${toleranceMs}ms of ${expectedDate.toISOString()}, but difference was ${timeDiff}ms`;
            },
            pass: isWithinRange
        };
    },

    /**
     * Prüft ob ein Array gültige RFID-Tags enthält
     */
    toContainValidRFIDTags(received) {
        const isArray = Array.isArray(received);
        const allValidTags = isArray && received.every(tag => {
            return typeof tag === 'string' &&
                tag.length >= 6 &&
                tag.length <= 20 &&
                /^[0-9A-Fa-f]+$/.test(tag);
        });

        const isValid = isArray && allValidTags;

        return {
            message: () => {
                if (!isArray) {
                    return `Expected received value to be an array, but received ${typeof received}`;
                }
                if (!allValidTags) {
                    const invalidTags = received.filter(tag => {
                        return !(typeof tag === 'string' &&
                            tag.length >= 6 &&
                            tag.length <= 20 &&
                            /^[0-9A-Fa-f]+$/.test(tag));
                    });
                    return `Expected all array elements to be valid RFID tags, but found invalid tags: ${JSON.stringify(invalidTags)}`;
                }
                return `Expected array to contain valid RFID tags`;
            },
            pass: isValid
        };
    },

    /**
     * Prüft ob ein Mock erfolgreich aufgerufen wurde
     */
    toHaveBeenCalledWithValidArgs(received, ...expectedArgs) {
        const isMockFunction = jest.isMockFunction(received);
        const wasCalled = isMockFunction && received.mock.calls.length > 0;

        if (!isMockFunction) {
            return {
                message: () => `Expected received value to be a mock function`,
                pass: false
            };
        }

        if (!wasCalled) {
            return {
                message: () => `Expected mock function to have been called`,
                pass: false
            };
        }

        // Prüfe ob mindestens ein Aufruf die erwarteten Argumente hatte
        const hasValidCall = received.mock.calls.some(callArgs => {
            if (callArgs.length !== expectedArgs.length) {
                return false;
            }

            return callArgs.every((arg, index) => {
                const expectedArg = expectedArgs[index];

                // Spezielle Validierung für verschiedene Typen
                if (typeof expectedArg === 'function') {
                    return expectedArg(arg); // Custom validator
                }

                return JSON.stringify(arg) === JSON.stringify(expectedArg);
            });
        });

        return {
            message: () => {
                const actualCalls = received.mock.calls.map(call => JSON.stringify(call)).join('\n  ');
                return `Expected mock function to have been called with valid arguments.\nExpected: ${JSON.stringify(expectedArgs)}\nActual calls:\n  ${actualCalls}`;
            },
            pass: hasValidCall
        };
    }
});

// Export für explizite Imports (falls benötigt)
module.exports = {};