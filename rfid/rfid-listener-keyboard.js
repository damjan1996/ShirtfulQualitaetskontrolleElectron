const { globalShortcut } = require('electron');
const EventEmitter = require('events');

class RFIDListenerKeyboard extends EventEmitter {
    constructor(callback = null) {
        super();

        this.callback = callback;
        this.isListening = false;
        this.buffer = '';
        this.lastInputTime = 0;
        this.inputTimeout = parseFloat(process.env.RFID_INPUT_TIMEOUT) || 500; // ms
        this.minScanInterval = parseFloat(process.env.RFID_MIN_SCAN_INTERVAL) || 1000; // ms
        this.lastScanTime = 0;
        this.maxBufferLength = parseInt(process.env.RFID_MAX_BUFFER_LENGTH) || 15;

        // Track registered shortcuts
        this.registeredShortcuts = [];

        console.log('RFID Keyboard Listener initialized:', {
            minScanInterval: this.minScanInterval,
            inputTimeout: this.inputTimeout,
            maxBufferLength: this.maxBufferLength
        });
    }

    async start() {
        if (this.isListening) {
            console.log('RFID Keyboard Listener is already running');
            return true;
        }

        try {
            console.log('Starting RFID Keyboard Listener...');

            // Clear any existing shortcuts first
            this.stop();

            // Register shortcuts for all hex characters (0-9, A-F)
            const hexChars = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'];

            // Register character inputs
            for (const char of hexChars) {
                try {
                    const registered = globalShortcut.register(char, () => {
                        this.handleKeyInput(char);
                    });

                    if (registered) {
                        this.registeredShortcuts.push(char);
                    } else {
                        console.warn(`Failed to register shortcut for: ${char}`);
                    }
                } catch (error) {
                    console.warn(`Error registering shortcut for ${char}:`, error.message);
                }
            }

            // Register Enter key for processing
            try {
                const enterRegistered = globalShortcut.register('Enter', () => {
                    this.processBuffer();
                });

                if (enterRegistered) {
                    this.registeredShortcuts.push('Enter');
                } else {
                    console.warn('Failed to register Enter key');
                }
            } catch (error) {
                console.warn('Error registering Enter key:', error.message);
            }

            // Also register Return as alternative
            try {
                const returnRegistered = globalShortcut.register('Return', () => {
                    this.processBuffer();
                });

                if (returnRegistered) {
                    this.registeredShortcuts.push('Return');
                }
            } catch (error) {
                // Ignore if Return is same as Enter on this system
            }

            this.isListening = true;
            this.emit('started');

            console.log(`✅ RFID Keyboard Listener started successfully`);
            console.log(`   Registered shortcuts: ${this.registeredShortcuts.length}`);
            console.log(`   Listening for: ${hexChars.join(', ')}, Enter`);

            return true;

        } catch (error) {
            console.error('❌ Failed to start RFID Keyboard Listener:', error);
            this.emit('error', error);
            return false;
        }
    }

    async stop() {
        if (!this.isListening && this.registeredShortcuts.length === 0) {
            return;
        }

        console.log('Stopping RFID Keyboard Listener...');

        try {
            // Unregister all our shortcuts
            this.registeredShortcuts.forEach(shortcut => {
                try {
                    globalShortcut.unregister(shortcut);
                } catch (error) {
                    console.warn(`Error unregistering ${shortcut}:`, error.message);
                }
            });

            this.registeredShortcuts = [];
            this.isListening = false;
            this.buffer = '';
            this.emit('stopped');

            console.log('✅ RFID Keyboard Listener stopped successfully');

        } catch (error) {
            console.error('❌ Error stopping RFID Keyboard Listener:', error);
        }
    }

    handleKeyInput(key) {
        const now = Date.now();

        // Check for input timeout (reset buffer if too much time passed)
        if (this.buffer && (now - this.lastInputTime) > this.inputTimeout) {
            console.log(`Input timeout, resetting buffer: "${this.buffer}"`);
            this.buffer = '';
        }

        this.lastInputTime = now;

        // Add character to buffer
        this.buffer += key.toUpperCase();

        // Prevent buffer overflow
        if (this.buffer.length > this.maxBufferLength) {
            this.buffer = this.buffer.slice(-this.maxBufferLength);
        }

        console.log(`Key input: ${key}, Buffer: ${this.buffer}`);
    }

    processBuffer() {
        if (!this.buffer) {
            return;
        }

        const tagId = this.buffer.trim().toUpperCase();
        const originalBuffer = this.buffer;
        this.buffer = '';

        // Validate tag
        if (!this.validateTagId(tagId)) {
            console.log(`Invalid tag format, ignoring: "${originalBuffer}"`);
            return;
        }

        // Check scan interval
        const now = Date.now();
        if (now - this.lastScanTime < this.minScanInterval) {
            console.log(`Scan too fast, ignoring: ${tagId}`);
            return;
        }

        this.lastScanTime = now;

        console.log(`✅ RFID Tag detected: ${tagId}`);

        // Emit tag event
        this.emit('tag', tagId);

        // Call callback if provided
        if (this.callback && typeof this.callback === 'function') {
            try {
                this.callback(tagId);
            } catch (error) {
                console.error('Error in RFID callback:', error);
            }
        }
    }

    validateTagId(tagId) {
        // Validate RFID tag format
        if (!tagId || typeof tagId !== 'string') {
            return false;
        }

        const cleanTag = tagId.trim().toUpperCase();

        // Check length (typical RFID tags are 8-12 hex characters)
        if (cleanTag.length < 8 || cleanTag.length > 12) {
            return false;
        }

        // Check if valid hex string
        if (!/^[0-9A-F]+$/.test(cleanTag)) {
            return false;
        }

        // Check if convertible to number and not zero
        try {
            const decimal = parseInt(cleanTag, 16);
            return decimal > 0;
        } catch (error) {
            return false;
        }
    }

    // Utility methods
    getStatus() {
        return {
            listening: this.isListening,
            deviceConnected: true, // Always true for keyboard listener
            buffer: this.buffer,
            lastScanTime: this.lastScanTime,
            registeredShortcuts: this.registeredShortcuts.length,
            type: 'keyboard',
            config: {
                minScanInterval: this.minScanInterval,
                inputTimeout: this.inputTimeout,
                maxBufferLength: this.maxBufferLength
            }
        };
    }

    clearBuffer() {
        this.buffer = '';
        console.log('RFID buffer cleared');
    }

    setMinScanInterval(interval) {
        this.minScanInterval = Math.max(100, interval); // Minimum 100ms
        console.log(`RFID scan interval set to ${this.minScanInterval}ms`);
    }

    // Test method for debugging
    simulateTag(tagId) {
        if (!this.validateTagId(tagId)) {
            console.error(`Invalid tag ID for simulation: ${tagId}`);
            return false;
        }

        console.log(`🧪 Simulating RFID tag: ${tagId}`);

        // Simulate the tag input
        this.buffer = tagId;
        this.processBuffer();

        return true;
    }

    // Manual tag input method (useful for testing)
    inputTag(tagId) {
        if (!this.isListening) {
            console.warn('RFID Listener not active');
            return false;
        }

        if (!this.validateTagId(tagId)) {
            console.error(`Invalid tag ID: ${tagId}`);
            return false;
        }

        console.log(`📝 Manual tag input: ${tagId}`);

        // Clear buffer and set new tag
        this.buffer = tagId.toUpperCase();
        this.processBuffer();

        return true;
    }

    // Check if shortcuts are available
    checkShortcutAvailability() {
        const testShortcuts = ['0', '1', 'A', 'Enter'];
        const available = [];
        const unavailable = [];

        testShortcuts.forEach(shortcut => {
            try {
                const registered = globalShortcut.register(shortcut, () => {});
                if (registered) {
                    available.push(shortcut);
                    globalShortcut.unregister(shortcut);
                } else {
                    unavailable.push(shortcut);
                }
            } catch (error) {
                unavailable.push(shortcut);
            }
        });

        return {
            available,
            unavailable,
            allAvailable: unavailable.length === 0
        };
    }

    // Get diagnostics information
    getDiagnostics() {
        const shortcutCheck = this.checkShortcutAvailability();

        return {
            status: this.getStatus(),
            shortcutAvailability: shortcutCheck,
            globalShortcuts: globalShortcut.isRegistered ? 'available' : 'unavailable',
            recommendations: this.getRecommendations(shortcutCheck)
        };
    }

    getRecommendations(shortcutCheck) {
        const recommendations = [];

        if (!shortcutCheck.allAvailable) {
            recommendations.push('Some keyboard shortcuts are not available - other applications may be using them');
            recommendations.push('Try closing other applications that might use global shortcuts');
        }

        if (!this.isListening) {
            recommendations.push('RFID Listener is not active - call start() to begin listening');
        }

        if (this.registeredShortcuts.length === 0) {
            recommendations.push('No shortcuts registered - this may indicate a system permission issue');
            recommendations.push('Try running the application with administrator privileges');
        }

        return recommendations;
    }
}

module.exports = RFIDListenerKeyboard;