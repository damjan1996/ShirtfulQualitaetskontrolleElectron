// tests/mocks/electron.mock.js
/**
 * Electron Module Mock für Tests
 */

const EventEmitter = require('events');

class MockBrowserWindow extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.webContents = new MockWebContents();
        this.isDestroyed = false;
        this.isMinimized = false;
        this.isMaximized = false;
        this.isFullScreen = false;
        this.isFocused = false;
    }

    loadFile(filePath) {
        return Promise.resolve();
    }

    loadURL(url) {
        return Promise.resolve();
    }

    show() {
        this.emit('show');
        return this;
    }

    hide() {
        this.emit('hide');
        return this;
    }

    close() {
        this.isDestroyed = true;
        this.emit('close');
        return this;
    }

    destroy() {
        this.isDestroyed = true;
        this.emit('destroy');
        return this;
    }

    minimize() {
        this.isMinimized = true;
        this.emit('minimize');
        return this;
    }

    maximize() {
        this.isMaximized = true;
        this.emit('maximize');
        return this;
    }

    unmaximize() {
        this.isMaximized = false;
        this.emit('unmaximize');
        return this;
    }

    setFullScreen(fullscreen) {
        this.isFullScreen = fullscreen;
        this.emit('enter-full-screen');
        return this;
    }

    focus() {
        this.isFocused = true;
        this.emit('focus');
        return this;
    }

    blur() {
        this.isFocused = false;
        this.emit('blur');
        return this;
    }

    getBounds() {
        return { x: 0, y: 0, width: 800, height: 600 };
    }

    setBounds(bounds) {
        return this;
    }

    getSize() {
        return [800, 600];
    }

    setSize(width, height) {
        return this;
    }

    getPosition() {
        return [0, 0];
    }

    setPosition(x, y) {
        return this;
    }

    isVisible() {
        return !this.isDestroyed;
    }

    isMinimized() {
        return this.isMinimized;
    }

    isMaximized() {
        return this.isMaximized;
    }

    isFullScreen() {
        return this.isFullScreen;
    }

    isFocused() {
        return this.isFocused;
    }

    isDestroyed() {
        return this.isDestroyed;
    }
}

class MockWebContents extends EventEmitter {
    constructor() {
        super();
        this.userAgent = 'MockElectron';
        this.session = new MockSession();
    }

    send(channel, ...args) {
        this.emit('mock-send', channel, ...args);
        return this;
    }

    invoke(channel, ...args) {
        return Promise.resolve(`mock-invoke-${channel}`);
    }

    openDevTools() {
        return this;
    }

    closeDevTools() {
        return this;
    }

    isDevToolsOpened() {
        return false;
    }

    reload() {
        this.emit('reload');
        return this;
    }

    setUserAgent(userAgent) {
        this.userAgent = userAgent;
        return this;
    }

    getUserAgent() {
        return this.userAgent;
    }

    insertCSS(css) {
        return Promise.resolve('mock-css-key');
    }

    removeInsertedCSS(key) {
        return Promise.resolve();
    }

    executeJavaScript(code) {
        return Promise.resolve('mock-js-result');
    }

    setZoomFactor(factor) {
        return this;
    }

    getZoomFactor() {
        return 1.0;
    }
}

class MockSession extends EventEmitter {
    constructor() {
        super();
        this.cookies = new MockCookies();
    }

    clearCache() {
        return Promise.resolve();
    }

    clearStorageData() {
        return Promise.resolve();
    }
}

class MockCookies extends EventEmitter {
    constructor() {
        super();
        this.cookieStore = new Map();
    }

    get(filter) {
        return Promise.resolve([]);
    }

    set(details) {
        return Promise.resolve();
    }

    remove(url, name) {
        return Promise.resolve();
    }
}

class MockApp extends EventEmitter {
    constructor() {
        super();
        this.isReady = false;
        this.version = '1.0.0';
        this.name = 'Mock Electron App';
    }

    async whenReady() {
        this.isReady = true;
        return Promise.resolve();
    }

    quit() {
        this.emit('quit');
        return this;
    }

    exit(exitCode = 0) {
        this.emit('exit', exitCode);
        return this;
    }

    relaunch(options = {}) {
        this.emit('relaunch');
        return this;
    }

    getVersion() {
        return this.version;
    }

    getName() {
        return this.name;
    }

    getPath(name) {
        const paths = {
            home: '/mock/home',
            appData: '/mock/appData',
            userData: '/mock/userData',
            temp: '/mock/temp',
            exe: '/mock/exe',
            desktop: '/mock/desktop',
            documents: '/mock/documents',
            downloads: '/mock/downloads',
            music: '/mock/music',
            pictures: '/mock/pictures',
            videos: '/mock/videos'
        };
        return paths[name] || '/mock/unknown';
    }

    setPath(name, path) {
        return this;
    }

    requestSingleInstanceLock() {
        return true;
    }

    releaseSingleInstanceLock() {
        return this;
    }

    hasSingleInstanceLock() {
        return true;
    }

    isReady() {
        return this.isReady;
    }

    dock = {
        setBadge: jest.fn(),
        getBadge: jest.fn(() => ''),
        hide: jest.fn(),
        show: jest.fn(),
        isVisible: jest.fn(() => true)
    };

    commandLine = {
        appendSwitch: jest.fn(),
        appendArgument: jest.fn()
    };
}

class MockIpcMain extends EventEmitter {
    constructor() {
        super();
        this.handlers = new Map();
    }

    handle(channel, listener) {
        this.handlers.set(channel, listener);
        return this;
    }

    handleOnce(channel, listener) {
        this.handlers.set(channel, listener);
        return this;
    }

    removeHandler(channel) {
        this.handlers.delete(channel);
        return this;
    }

    removeAllHandlers() {
        this.handlers.clear();
        return this;
    }

    // Test-Helper
    async invokeHandler(channel, ...args) {
        const handler = this.handlers.get(channel);
        if (handler) {
            return await handler({ reply: jest.fn() }, ...args);
        }
        throw new Error(`No handler registered for channel: ${channel}`);
    }
}

class MockIpcRenderer extends EventEmitter {
    constructor() {
        super();
    }

    invoke(channel, ...args) {
        return Promise.resolve(`mock-invoke-${channel}`);
    }

    send(channel, ...args) {
        this.emit('mock-send', channel, ...args);
        return this;
    }

    sendSync(channel, ...args) {
        return `mock-sync-${channel}`;
    }

    sendTo(webContentsId, channel, ...args) {
        return this;
    }

    sendToHost(channel, ...args) {
        return this;
    }
}

class MockGlobalShortcut {
    constructor() {
        this.shortcuts = new Map();
    }

    register(accelerator, callback) {
        this.shortcuts.set(accelerator, callback);
        return true;
    }

    registerAll(accelerators, callback) {
        accelerators.forEach(acc => this.register(acc, callback));
        return this;
    }

    isRegistered(accelerator) {
        return this.shortcuts.has(accelerator);
    }

    unregister(accelerator) {
        this.shortcuts.delete(accelerator);
        return this;
    }

    unregisterAll() {
        this.shortcuts.clear();
        return this;
    }

    // Test-Helper
    triggerShortcut(accelerator) {
        const callback = this.shortcuts.get(accelerator);
        if (callback) {
            callback();
        }
    }
}

class MockDialog {
    static async showOpenDialog(browserWindow, options) {
        return {
            canceled: false,
            filePaths: ['/mock/selected/file.txt']
        };
    }

    static async showSaveDialog(browserWindow, options) {
        return {
            canceled: false,
            filePath: '/mock/saved/file.txt'
        };
    }

    static async showMessageBox(browserWindow, options) {
        return {
            response: 0,
            checkboxChecked: false
        };
    }

    static showErrorBox(title, content) {
        // Mock-Implementation
    }

    static async showCertificateTrustDialog(browserWindow, options) {
        return Promise.resolve();
    }
}

class MockContextBridge {
    static exposeInMainWorld(apiKey, api) {
        global[apiKey] = api;
        return this;
    }
}

// Erstelle Mock-Instanzen
const mockApp = new MockApp();
const mockIpcMain = new MockIpcMain();
const mockIpcRenderer = new MockIpcRenderer();
const mockGlobalShortcut = new MockGlobalShortcut();

// Export der Mock-Module
const mockElectron = {
    app: mockApp,
    BrowserWindow: MockBrowserWindow,
    ipcMain: mockIpcMain,
    ipcRenderer: mockIpcRenderer,
    globalShortcut: mockGlobalShortcut,
    dialog: MockDialog,
    contextBridge: MockContextBridge,

    // Utility Classes
    WebContents: MockWebContents,
    Session: MockSession,
    Cookies: MockCookies,

    // Constants
    __dirname: '/mock/electron',
    __filename: '/mock/electron/index.js',

    // Process Info
    process: {
        platform: 'win32',
        arch: 'x64',
        version: 'v16.0.0',
        versions: {
            electron: '27.0.0',
            chrome: '118.0.0.0',
            node: '18.17.1'
        }
    }
};

module.exports = {
    mockElectron,
    MockBrowserWindow,
    MockWebContents,
    MockApp,
    MockIpcMain,
    MockIpcRenderer,
    MockGlobalShortcut,
    MockDialog,
    MockContextBridge
};