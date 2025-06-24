// tests/mocks/db-client.mock.js
/**
 * Mock-Implementation des Database-Clients für Tests
 */

class MockDatabaseClient {
    constructor() {
        this.isConnected = false;
        this.mockData = {
            users: [
                { ID: 1, BenutzerName: 'Test User 1', EPC: 1392525588, xStatus: 0 },
                { ID: 2, BenutzerName: 'Test User 2', EPC: 2271560481, xStatus: 0 }
            ],
            sessions: [],
            qrScans: []
        };
        this.duplicateCache = new Map();
        this.pendingScans = new Map();
    }

    async connect() {
        this.isConnected = true;
        return Promise.resolve(true);
    }

    async close() {
        this.isConnected = false;
        return Promise.resolve();
    }

    async query(sql, params = []) {
        if (!this.isConnected) {
            throw new Error('Database not connected');
        }

        // Simuliere verschiedene Queries
        if (sql.includes('SELECT') && sql.includes('ScannBenutzer')) {
            return {
                recordset: this.mockData.users.filter(u =>
                    params.length === 0 || u.EPC === params[0]
                ),
                rowsAffected: [1]
            };
        }

        if (sql.includes('INSERT INTO') && sql.includes('Sessions')) {
            const session = {
                ID: this.mockData.sessions.length + 1,
                UserID: params[0],
                StartTS: new Date().toISOString(),
                Active: 1
            };
            this.mockData.sessions.push(session);
            return {
                recordset: [session],
                rowsAffected: [1]
            };
        }

        if (sql.includes('INSERT INTO') && sql.includes('QrScans')) {
            const scan = {
                ID: this.mockData.qrScans.length + 1,
                SessionID: params[0],
                RawPayload: params[1],
                CapturedTS: new Date().toISOString(),
                Valid: 1
            };
            this.mockData.qrScans.push(scan);
            return {
                recordset: [scan],
                rowsAffected: [1]
            };
        }

        return { recordset: [], rowsAffected: [0] };
    }

    async getUserByEPC(epcHex) {
        const epcDecimal = parseInt(epcHex, 16);
        return this.mockData.users.find(u => u.EPC === epcDecimal) || null;
    }

    async createSession(userId) {
        const session = {
            ID: this.mockData.sessions.length + 1,
            UserID: userId,
            StartTS: new Date().toISOString(),
            Active: 1
        };
        this.mockData.sessions.push(session);
        return session;
    }

    async endSession(sessionId) {
        const session = this.mockData.sessions.find(s => s.ID === sessionId);
        if (session) {
            session.EndTS = new Date().toISOString();
            session.Active = 0;
            return true;
        }
        return false;
    }

    async saveQRScan(sessionId, payload) {
        // Simuliere Duplikat-Erkennung
        if (this.duplicateCache.has(payload)) {
            const lastScan = this.duplicateCache.get(payload);
            const minutesAgo = Math.floor((Date.now() - lastScan) / (1000 * 60));

            if (minutesAgo < 10) {
                return {
                    success: false,
                    status: 'duplicate_cache',
                    message: `QR-Code bereits vor ${minutesAgo} Minuten gescannt`,
                    data: null,
                    duplicateInfo: { minutesAgo, source: 'cache' },
                    timestamp: new Date().toISOString()
                };
            }
        }

        // Erfolgreiche Speicherung simulieren
        const scan = {
            ID: this.mockData.qrScans.length + 1,
            SessionID: sessionId,
            RawPayload: payload,
            CapturedTS: new Date().toISOString(),
            Valid: 1
        };

        this.mockData.qrScans.push(scan);
        this.duplicateCache.set(payload, Date.now());

        return {
            success: true,
            status: 'saved',
            message: 'QR-Code erfolgreich gespeichert',
            data: scan,
            timestamp: new Date().toISOString()
        };
    }

    async healthCheck() {
        return {
            connected: this.isConnected,
            connectionTime: 50,
            server: {
                DatabaseName: 'RdScanner_Test',
                CurrentUser: 'test_user',
                ServerTime: new Date().toISOString()
            },
            stats: {
                ActiveUsers: this.mockData.users.length,
                TotalSessions: this.mockData.sessions.length,
                ActiveSessions: this.mockData.sessions.filter(s => s.Active).length,
                TotalValidScans: this.mockData.qrScans.length
            },
            timestamp: new Date().toISOString()
        };
    }

    // Test-Helper-Methoden
    reset() {
        this.mockData = {
            users: [
                { ID: 1, BenutzerName: 'Test User 1', EPC: 1392525588, xStatus: 0 },
                { ID: 2, BenutzerName: 'Test User 2', EPC: 2271560481, xStatus: 0 }
            ],
            sessions: [],
            qrScans: []
        };
        this.duplicateCache.clear();
        this.pendingScans.clear();
    }

    addTestUser(user) {
        this.mockData.users.push({
            ID: this.mockData.users.length + 1,
            ...user
        });
    }
}

module.exports = MockDatabaseClient;

// ===== tests/mocks/rfid-listener.mock.js =====

class MockRFIDListener {
    constructor(callback = null) {
        this.callback = callback;
        this.isListening = false;
        this.buffer = '';
        this.registeredShortcuts = [];
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            startTime: new Date()
        };
    }

    async start() {
        this.isListening = true;
        this.registeredShortcuts = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F', 'Enter'];
        return true;
    }

    async stop() {
        this.isListening = false;
        this.registeredShortcuts = [];
        this.buffer = '';
    }

    handleInput(char) {
        if (!this.isListening) return;
        this.buffer += char.toUpperCase();
    }

    processTag() {
        if (!this.buffer) return;

        const tagId = this.buffer.trim().toUpperCase();
        this.buffer = '';

        if (this.validateTag(tagId)) {
            this.stats.totalScans++;
            this.stats.validScans++;

            if (this.callback) {
                this.callback(tagId);
            }
        } else {
            this.stats.invalidScans++;
        }
    }

    validateTag(tagId) {
        if (!tagId || typeof tagId !== 'string') return false;
        if (tagId.length < 6 || tagId.length > 14) return false;
        if (!/^[0-9A-F]+$/.test(tagId)) return false;

        try {
            const decimal = parseInt(tagId, 16);
            return decimal > 0;
        } catch {
            return false;
        }
    }

    simulateTag(tagId) {
        if (!this.isListening) return false;

        this.buffer = tagId.toUpperCase();
        this.processTag();
        return true;
    }

    simulateKeySequence(sequence) {
        if (!this.isListening) return;

        for (const char of sequence) {
            if (/[0-9A-Fa-f]/.test(char)) {
                this.handleInput(char);
            }
        }
        this.processTag();
    }

    getStatus() {
        const uptime = Date.now() - this.stats.startTime.getTime();

        return {
            listening: this.isListening,
            deviceConnected: true,
            buffer: this.buffer,
            registeredShortcuts: this.registeredShortcuts.length,
            type: 'mock-keyboard',
            config: {
                minScanInterval: 1000,
                inputTimeout: 500,
                maxBufferLength: 15
            },
            stats: {
                ...this.stats,
                uptime: Math.floor(uptime / 1000),
                scansPerMinute: this.stats.totalScans / (uptime / 60000) || 0,
                successRate: this.stats.totalScans > 0 ? (this.stats.validScans / this.stats.totalScans * 100) : 0
            }
        };
    }

    clearBuffer() {
        this.buffer = '';
    }

    resetStats() {
        this.stats = {
            totalScans: 0,
            validScans: 0,
            invalidScans: 0,
            duplicateScans: 0,
            startTime: new Date()
        };
    }
}

module.exports = MockRFIDListener;

// ===== tests/mocks/electron.mock.js =====

class MockBrowserWindow {
    constructor(options = {}) {
        this.options = options;
        this.isDestroyed = false;
        this.webContents = new MockWebContents();
        this._isMinimized = false;
        this._isMaximized = false;
        this._isVisible = false;
        this.eventListeners = new Map();
    }

    loadFile(filePath) {
        if (this.isDestroyed) throw new Error('Window is destroyed');
        return Promise.resolve();
    }

    show() {
        if (this.isDestroyed) throw new Error('Window is destroyed');
        this._isVisible = true;
        this.emit('show');
    }

    hide() {
        if (this.isDestroyed) throw new Error('Window is destroyed');
        this._isVisible = false;
        this.emit('hide');
    }

    close() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;
        this.emit('closed');
    }

    minimize() {
        if (this.isDestroyed) throw new Error('Window is destroyed');
        this._isMinimized = true;
        this.emit('minimize');
    }

    maximize() {
        if (this.isDestroyed) throw new Error('Window is destroyed');
        this._isMaximized = true;
        this.emit('maximize');
    }

    isMinimized() {
        return this._isMinimized;
    }

    isMaximized() {
        return this._isMaximized;
    }

    focus() {
        if (this.isDestroyed) throw new Error('Window is destroyed');
        this.emit('focus');
    }

    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }

    once(event, listener) {
        const wrappedListener = (...args) => {
            listener(...args);
            this.removeListener(event, wrappedListener);
        };
        this.on(event, wrappedListener);
    }

    removeListener(event, listener) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(listener);
            if (index !== -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, ...args) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error('Error in event listener:', error);
                }
            });
        }
    }
}

class MockWebContents {
    constructor() {
        this.eventListeners = new Map();
    }

    send(channel, ...args) {
        // Simuliere das Senden von Nachrichten an den Renderer
        this.emit(channel, ...args);
    }

    on(event, listener) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }

    removeAllListeners(event) {
        if (event) {
            this.eventListeners.delete(event);
        } else {
            this.eventListeners.clear();
        }
    }

    emit(event, ...args) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(listener => {
                try {
                    listener(...args);
                } catch (error) {
                    console.error('Error in web contents event listener:', error);
                }
            });
        }
    }

    openDevTools() {
        // Mock implementation
    }
}

const mockElectron = {
    app: {
        ...global.mockElectron.app,
        getAllWindows: jest.fn(() => []),
        getVersion: jest.fn(() => '1.0.0'),
        getPath: jest.fn((name) => `/mock/path/${name}`),
        isReady: jest.fn(() => true)
    },
    BrowserWindow: MockBrowserWindow,
    ipcMain: {
        handle: jest.fn(),
        on: jest.fn(),
        removeAllListeners: jest.fn()
    },
    globalShortcut: {
        register: jest.fn(() => true),
        unregister: jest.fn(),
        unregisterAll: jest.fn(),
        isRegistered: jest.fn(() => false),
        getAll: jest.fn(() => [])
    },
    dialog: {
        showErrorBox: jest.fn(),
        showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
        showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
        showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' }))
    }
};

module.exports = {
    MockBrowserWindow,
    MockWebContents,
    mockElectron
};

// ===== tests/mocks/camera.mock.js =====

class MockMediaStream {
    constructor() {
        this.tracks = [
            new MockMediaStreamTrack('video'),
            new MockMediaStreamTrack('audio')
        ];
        this.active = true;
        this.id = 'mock-stream-' + Math.random().toString(36).substr(2, 9);
    }

    getTracks() {
        return [...this.tracks];
    }

    getVideoTracks() {
        return this.tracks.filter(track => track.kind === 'video');
    }

    getAudioTracks() {
        return this.tracks.filter(track => track.kind === 'audio');
    }

    addTrack(track) {
        this.tracks.push(track);
    }

    removeTrack(track) {
        const index = this.tracks.indexOf(track);
        if (index !== -1) {
            this.tracks.splice(index, 1);
        }
    }
}

class MockMediaStreamTrack {
    constructor(kind = 'video') {
        this.kind = kind;
        this.id = 'mock-track-' + Math.random().toString(36).substr(2, 9);
        this.label = `Mock ${kind} track`;
        this.enabled = true;
        this.muted = false;
        this.readyState = 'live';
    }

    stop() {
        this.readyState = 'ended';
    }

    clone() {
        return new MockMediaStreamTrack(this.kind);
    }
}

const mockCamera = {
    getUserMedia: jest.fn(() => Promise.resolve(new MockMediaStream())),
    enumerateDevices: jest.fn(() => Promise.resolve([
        {
            deviceId: 'mock-camera-1',
            kind: 'videoinput',
            label: 'Mock Front Camera',
            groupId: 'mock-group-1'
        },
        {
            deviceId: 'mock-camera-2',
            kind: 'videoinput',
            label: 'Mock Back Camera',
            groupId: 'mock-group-2'
        }
    ])),
    getSupportedConstraints: jest.fn(() => ({
        width: true,
        height: true,
        frameRate: true,
        facingMode: true,
        deviceId: true
    })),
    MediaStream: MockMediaStream,
    MediaStreamTrack: MockMediaStreamTrack
};

module.exports = {
    MockMediaStream,
    MockMediaStreamTrack,
    mockCamera
};

// ===== tests/mocks/qr-scanner.mock.js =====

class MockQRScanner {
    constructor() {
        this.isScanning = false;
        this.mockCodes = [
            'TEST_QR_CODE_1',
            '{"type":"package","id":"PKG001"}',
            '1234567890123',
            'https://example.com/package/123'
        ];
        this.scanIndex = 0;
    }

    start(videoElement, callback) {
        this.isScanning = true;
        this.callback = callback;

        // Simuliere periodische QR-Code-Erkennung
        this.scanInterval = setInterval(() => {
            if (this.isScanning && Math.random() < 0.3) { // 30% Chance
                const code = this.mockCodes[this.scanIndex % this.mockCodes.length];
                this.scanIndex++;

                if (this.callback) {
                    this.callback(code);
                }
            }
        }, 1000);
    }

    stop() {
        this.isScanning = false;
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    scanImage(imageData) {
        // Simuliere QR-Code-Erkennung in Bild
        if (Math.random() < 0.5) {
            return {
                data: this.mockCodes[this.scanIndex % this.mockCodes.length],
                location: {
                    topLeftCorner: { x: 10, y: 10 },
                    topRightCorner: { x: 100, y: 10 },
                    bottomLeftCorner: { x: 10, y: 100 },
                    bottomRightCorner: { x: 100, y: 100 }
                }
            };
        }
        return null;
    }
}

// jsQR Mock
const mockJsQR = jest.fn((data, width, height) => {
    // Simuliere QR-Code-Erkennung
    if (Math.random() < 0.3) {
        return {
            data: 'MOCK_QR_CODE_' + Date.now(),
            location: {
                topLeftCorner: { x: 10, y: 10 },
                topRightCorner: { x: 100, y: 10 },
                bottomLeftCorner: { x: 10, y: 100 },
                bottomRightCorner: { x: 100, y: 100 }
            }
        };
    }
    return null;
});

module.exports = {
    MockQRScanner,
    mockJsQR
};