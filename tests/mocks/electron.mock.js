/**
 * Vollständiger Electron Mock für Tests
 * Simuliert alle benötigten Electron APIs
 */

// Mock für App
const mockApp = {
    getName: jest.fn(() => 'RFID QR Test App'),
    getVersion: jest.fn(() => '1.0.1'),
    getAppPath: jest.fn(() => '/test/app/path'),
    getPath: jest.fn((name) => {
        const paths = {
            home: '/home/test',
            appData: '/home/test/.config',
            userData: '/home/test/.config/test-app',
            temp: '/tmp',
            exe: '/path/to/app',
            module: '/path/to/app',
            desktop: '/home/test/Desktop',
            documents: '/home/test/Documents',
            downloads: '/home/test/Downloads',
            music: '/home/test/Music',
            pictures: '/home/test/Pictures',
            videos: '/home/test/Videos'
        };
        return paths[name] || '/test/path';
    }),
    whenReady: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    quit: jest.fn(),
    exit: jest.fn(),
    relaunch: jest.fn(),
    isReady: jest.fn(() => true),
    focus: jest.fn(),
    hide: jest.fn(),
    show: jest.fn(),
    getAppMetrics: jest.fn(() => []),
    getGPUFeatureStatus: jest.fn(() => ({})),
    getGPUInfo: jest.fn(() => Promise.resolve({})),
    setBadgeCount: jest.fn(),
    getBadgeCount: jest.fn(() => 0),
    requestSingleInstanceLock: jest.fn(() => true),
    hasSingleInstanceLock: jest.fn(() => true),
    releaseSingleInstanceLock: jest.fn(),
    setUserTasks: jest.fn(),
    importCertificate: jest.fn(() => Promise.resolve()),
    disableHardwareAcceleration: jest.fn(),
    allowRendererProcessReuse: jest.fn(),
    commandLine: {
        appendSwitch: jest.fn(),
        appendArgument: jest.fn(),
        hasSwitch: jest.fn(() => false),
        getSwitchValue: jest.fn(() => '')
    }
};

// Mock für IPC Main
const mockIpcMain = {
    handle: jest.fn(),
    handleOnce: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    handlers: new Map() // Für Test-Tracking
};

// Mock für IPC Renderer
const mockIpcRenderer = {
    invoke: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    sendSync: jest.fn(() => ({})),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    postMessage: jest.fn(),
    sendTo: jest.fn(),
    sendToHost: jest.fn()
};

// Mock für Context Bridge
const mockContextBridge = {
    exposeInMainWorld: jest.fn(),
    exposeInIsolatedWorld: jest.fn()
};

// Mock für BrowserWindow
const mockBrowserWindow = jest.fn().mockImplementation((options = {}) => {
    const instance = {
        id: Math.floor(Math.random() * 1000),
        options: options,
        loadFile: jest.fn(() => Promise.resolve()),
        loadURL: jest.fn(() => Promise.resolve()),
        show: jest.fn(),
        hide: jest.fn(),
        close: jest.fn(),
        focus: jest.fn(),
        blur: jest.fn(),
        minimize: jest.fn(),
        maximize: jest.fn(),
        unmaximize: jest.fn(),
        restore: jest.fn(),
        setFullScreen: jest.fn(),
        isMaximized: jest.fn(() => false),
        isMinimized: jest.fn(() => false),
        isFullScreen: jest.fn(() => false),
        isVisible: jest.fn(() => true),
        isFocused: jest.fn(() => true),
        isDestroyed: jest.fn(() => false),
        setTitle: jest.fn(),
        getTitle: jest.fn(() => 'Test Window'),
        setBounds: jest.fn(),
        getBounds: jest.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
        setSize: jest.fn(),
        getSize: jest.fn(() => [800, 600]),
        setPosition: jest.fn(),
        getPosition: jest.fn(() => [0, 0]),
        setContentSize: jest.fn(),
        getContentSize: jest.fn(() => [800, 600]),
        setMinimumSize: jest.fn(),
        getMinimumSize: jest.fn(() => [400, 300]),
        setMaximumSize: jest.fn(),
        getMaximumSize: jest.fn(() => [1920, 1080]),
        setResizable: jest.fn(),
        isResizable: jest.fn(() => true),
        setAlwaysOnTop: jest.fn(),
        isAlwaysOnTop: jest.fn(() => false),
        center: jest.fn(),
        setIcon: jest.fn(),
        flashFrame: jest.fn(),
        setSkipTaskbar: jest.fn(),
        setKiosk: jest.fn(),
        isKiosk: jest.fn(() => false),
        setRepresentedFilename: jest.fn(),
        getRepresentedFilename: jest.fn(() => ''),
        setDocumentEdited: jest.fn(),
        isDocumentEdited: jest.fn(() => false),
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        emit: jest.fn(),
        webContents: {
            id: Math.floor(Math.random() * 1000),
            send: jest.fn(),
            sendSync: jest.fn(() => ({})),
            postMessage: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            removeListener: jest.fn(),
            removeAllListeners: jest.fn(),
            openDevTools: jest.fn(),
            closeDevTools: jest.fn(),
            isDevToolsOpened: jest.fn(() => false),
            isDevToolsFocused: jest.fn(() => false),
            toggleDevTools: jest.fn(),
            inspectElement: jest.fn(),
            inspectSharedWorker: jest.fn(),
            inspectServiceWorker: jest.fn(),
            reload: jest.fn(),
            reloadIgnoringCache: jest.fn(),
            goBack: jest.fn(),
            goForward: jest.fn(),
            goToIndex: jest.fn(),
            stop: jest.fn(),
            canGoBack: jest.fn(() => false),
            canGoForward: jest.fn(() => false),
            getUserAgent: jest.fn(() => 'test-agent'),
            setUserAgent: jest.fn(),
            insertCSS: jest.fn(() => Promise.resolve()),
            removeInsertedCSS: jest.fn(() => Promise.resolve()),
            executeJavaScript: jest.fn(() => Promise.resolve()),
            zoomFactor: 1,
            getZoomFactor: jest.fn(() => 1),
            setZoomFactor: jest.fn(),
            getZoomLevel: jest.fn(() => 0),
            setZoomLevel: jest.fn(),
            undo: jest.fn(),
            redo: jest.fn(),
            cut: jest.fn(),
            copy: jest.fn(),
            paste: jest.fn(),
            selectAll: jest.fn(),
            unselect: jest.fn(),
            replace: jest.fn(),
            replaceMisspelling: jest.fn(),
            findInPage: jest.fn(() => ({})),
            stopFindInPage: jest.fn(),
            capturePage: jest.fn(() => Promise.resolve({})),
            print: jest.fn(() => Promise.resolve()),
            printToPDF: jest.fn(() => Promise.resolve(Buffer.alloc(0))),
            setAudioMuted: jest.fn(),
            isAudioMuted: jest.fn(() => false),
            isCurrentlyAudible: jest.fn(() => false),
            setFrameRate: jest.fn(),
            getFrameRate: jest.fn(() => 60),
            invalidate: jest.fn(),
            getWebRTCIPHandlingPolicy: jest.fn(() => 'default'),
            setWebRTCIPHandlingPolicy: jest.fn(),
            downloadURL: jest.fn(),
            hasUserGesture: jest.fn(() => false),
            getOSProcessId: jest.fn(() => 1234),
            getProcessId: jest.fn(() => 1234),
            takeHeapSnapshot: jest.fn(() => Promise.resolve(true)),
            setBackgroundThrottling: jest.fn(),
            getTitle: jest.fn(() => 'Test Page'),
            isLoading: jest.fn(() => false),
            isWaitingForResponse: jest.fn(() => false),
            isDestroyed: jest.fn(() => false),
            isCrashed: jest.fn(() => false)
        }
    };

    // Mock static methods
    return instance;
});

// BrowserWindow static methods
mockBrowserWindow.getAllWindows = jest.fn(() => []);
mockBrowserWindow.getFocusedWindow = jest.fn(() => null);
mockBrowserWindow.fromWebContents = jest.fn(() => null);
mockBrowserWindow.fromBrowserView = jest.fn(() => null);
mockBrowserWindow.fromId = jest.fn(() => null);

// Mock für Dialog
const mockDialog = {
    showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
    showOpenDialogSync: jest.fn(() => []),
    showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' })),
    showSaveDialogSync: jest.fn(() => ''),
    showMessageBox: jest.fn(() => Promise.resolve({ response: 0, checkboxChecked: false })),
    showMessageBoxSync: jest.fn(() => 0),
    showErrorBox: jest.fn(),
    showCertificateTrustDialog: jest.fn(() => Promise.resolve())
};

// Mock für Shell
const mockShell = {
    showItemInFolder: jest.fn(),
    openPath: jest.fn(() => Promise.resolve('')),
    openExternal: jest.fn(() => Promise.resolve()),
    moveItemToTrash: jest.fn(() => Promise.resolve(true)),
    beep: jest.fn(),
    writeShortcutLink: jest.fn(() => true),
    readShortcutLink: jest.fn(() => ({}))
};

// Mock für Screen
const mockScreen = {
    getCursorScreenPoint: jest.fn(() => ({ x: 0, y: 0 })),
    getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        size: { width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1040 },
        scaleFactor: 1,
        rotation: 0,
        internal: true,
        touchSupport: 'unknown',
        accelerometerSupport: 'unknown'
    })),
    getAllDisplays: jest.fn(() => []),
    getDisplayNearestPoint: jest.fn(() => ({})),
    getDisplayMatching: jest.fn(() => ({})),
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
};

// Mock für Native Image
const mockNativeImage = {
    createEmpty: jest.fn(() => ({})),
    createFromPath: jest.fn(() => ({})),
    createFromBitmap: jest.fn(() => ({})),
    createFromBuffer: jest.fn(() => ({})),
    createFromDataURL: jest.fn(() => ({})),
    createFromNamedImage: jest.fn(() => ({}))
};

// Mock für Menu
const mockMenu = {
    buildFromTemplate: jest.fn(() => ({})),
    setApplicationMenu: jest.fn(),
    getApplicationMenu: jest.fn(() => null),
    sendActionToFirstResponder: jest.fn(),
    popup: jest.fn()
};

// Mock für MenuItem
const mockMenuItem = jest.fn().mockImplementation(() => ({
    click: jest.fn(),
    enabled: true,
    visible: true,
    checked: false,
    label: 'Test Item',
    type: 'normal'
}));

// Mock für Clipboard
const mockClipboard = {
    readText: jest.fn(() => ''),
    writeText: jest.fn(),
    readHTML: jest.fn(() => ''),
    writeHTML: jest.fn(),
    readImage: jest.fn(() => ({})),
    writeImage: jest.fn(),
    readRTF: jest.fn(() => ''),
    writeRTF: jest.fn(),
    readBookmark: jest.fn(() => ({ title: '', url: '' })),
    writeBookmark: jest.fn(),
    readFindText: jest.fn(() => ''),
    writeFindText: jest.fn(),
    clear: jest.fn(),
    availableFormats: jest.fn(() => []),
    has: jest.fn(() => false),
    read: jest.fn(() => ''),
    write: jest.fn()
};

// Mock für Global Shortcut
const mockGlobalShortcut = {
    register: jest.fn(() => true),
    registerAll: jest.fn(),
    isRegistered: jest.fn(() => false),
    unregister: jest.fn(),
    unregisterAll: jest.fn()
};

// Mock für Notification
const mockNotification = jest.fn().mockImplementation(() => ({
    show: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
}));

// Mock für PowerMonitor
const mockPowerMonitor = {
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    getSystemIdleState: jest.fn(() => 'active'),
    getSystemIdleTime: jest.fn(() => 0)
};

// Zusammengestellter Mock
const mockElectron = {
    app: mockApp,
    BrowserWindow: mockBrowserWindow,
    ipcMain: mockIpcMain,
    ipcRenderer: mockIpcRenderer,
    contextBridge: mockContextBridge,
    dialog: mockDialog,
    shell: mockShell,
    screen: mockScreen,
    nativeImage: mockNativeImage,
    Menu: mockMenu,
    MenuItem: mockMenuItem,
    clipboard: mockClipboard,
    globalShortcut: mockGlobalShortcut,
    Notification: mockNotification,
    powerMonitor: mockPowerMonitor,

    // Electron-spezifische Konstanten
    webFrame: {
        setZoomFactor: jest.fn(),
        getZoomFactor: jest.fn(() => 1),
        setZoomLevel: jest.fn(),
        getZoomLevel: jest.fn(() => 0),
        executeJavaScript: jest.fn(() => Promise.resolve()),
        insertCSS: jest.fn(() => Promise.resolve()),
        insertText: jest.fn(),
        setVisualZoomLevelLimits: jest.fn(),
        setLayoutZoomLevelLimits: jest.fn(),
        setSpellCheckProvider: jest.fn(),
        registerURLSchemeAsSecure: jest.fn(),
        registerURLSchemeAsStandard: jest.fn(),
        registerURLSchemeAsPrivileged: jest.fn(),
        registerURLSchemeAsCORSEnabled: jest.fn(),
        registerURLSchemeAsDisplayIsolated: jest.fn()
    },

    remote: {
        app: mockApp,
        BrowserWindow: mockBrowserWindow,
        dialog: mockDialog,
        shell: mockShell,
        screen: mockScreen,
        Menu: mockMenu,
        MenuItem: mockMenuItem,
        clipboard: mockClipboard,
        globalShortcut: mockGlobalShortcut,
        getCurrentWindow: jest.fn(() => ({})),
        getCurrentWebContents: jest.fn(() => ({})),
        getGlobal: jest.fn(() => ({})),
        process: {
            platform: 'win32',
            versions: {
                electron: '22.0.0',
                node: '16.17.1',
                chrome: '108.0.5359.215',
                v8: '10.8.168.25-electron.0'
            },
            env: {},
            argv: [],
            pid: 1234,
            arch: 'x64'
        }
    }
};

module.exports = {
    mockElectron,

    // Einzelne Mocks für direkten Import
    mockApp,
    mockBrowserWindow,
    mockIpcMain,
    mockIpcRenderer,
    mockContextBridge,
    mockDialog,
    mockShell,
    mockScreen,
    mockNativeImage,
    mockMenu,
    mockMenuItem,
    mockClipboard,
    mockGlobalShortcut,
    mockNotification,
    mockPowerMonitor
};