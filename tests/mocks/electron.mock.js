// tests/mocks/electron.mock.js
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

// Mock für IPC Main - mit korrekter handlers Map
const mockIpcMain = {
    handle: jest.fn(),
    handleOnce: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    handlers: new Map() // handlers Map hinzugefügt
};

// Mock für IPC Renderer
const mockIpcRenderer = {
    invoke: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    sendSync: jest.fn(() => null),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    postMessage: jest.fn(),
    sendTo: jest.fn(),
    sendToHost: jest.fn()
};

// Mock für BrowserWindow
const mockBrowserWindow = jest.fn().mockImplementation((options) => {
    const win = {
        id: Math.floor(Math.random() * 1000),
        loadFile: jest.fn(() => Promise.resolve()),
        loadURL: jest.fn(() => Promise.resolve()),
        webContents: {
            send: jest.fn(),
            executeJavaScript: jest.fn(() => Promise.resolve()),
            openDevTools: jest.fn(),
            closeDevTools: jest.fn(),
            isDevToolsOpened: jest.fn(() => false),
            reload: jest.fn(),
            reloadIgnoringCache: jest.fn(),
            setZoomLevel: jest.fn(),
            getZoomLevel: jest.fn(() => 0),
            setZoomFactor: jest.fn(),
            getZoomFactor: jest.fn(() => 1),
            undo: jest.fn(),
            redo: jest.fn(),
            cut: jest.fn(),
            copy: jest.fn(),
            paste: jest.fn(),
            delete: jest.fn(),
            selectAll: jest.fn(),
            findInPage: jest.fn(),
            stopFindInPage: jest.fn(),
            focus: jest.fn(),
            isFocused: jest.fn(() => true)
        },
        on: jest.fn(),
        once: jest.fn(),
        removeListener: jest.fn(),
        removeAllListeners: jest.fn(),
        emit: jest.fn(),
        show: jest.fn(),
        hide: jest.fn(),
        close: jest.fn(),
        destroy: jest.fn(),
        minimize: jest.fn(),
        maximize: jest.fn(),
        unmaximize: jest.fn(),
        isMinimized: jest.fn(() => false),
        isMaximized: jest.fn(() => false),
        setFullScreen: jest.fn(),
        isFullScreen: jest.fn(() => false),
        setAlwaysOnTop: jest.fn(),
        isAlwaysOnTop: jest.fn(() => false),
        center: jest.fn(),
        setPosition: jest.fn(),
        getPosition: jest.fn(() => [100, 100]),
        setSize: jest.fn(),
        getSize: jest.fn(() => [1200, 800]),
        setBounds: jest.fn(),
        getBounds: jest.fn(() => ({ x: 100, y: 100, width: 1200, height: 800 })),
        setResizable: jest.fn(),
        isResizable: jest.fn(() => true),
        setMovable: jest.fn(),
        isMovable: jest.fn(() => true),
        setMinimizable: jest.fn(),
        isMinimizable: jest.fn(() => true),
        setMaximizable: jest.fn(),
        isMaximizable: jest.fn(() => true),
        setClosable: jest.fn(),
        isClosable: jest.fn(() => true),
        setTitle: jest.fn(),
        getTitle: jest.fn(() => 'Test Window'),
        flashFrame: jest.fn(),
        setSkipTaskbar: jest.fn(),
        setIcon: jest.fn(),
        setMenu: jest.fn(),
        removeMenu: jest.fn(),
        setProgressBar: jest.fn(),
        setThumbarButtons: jest.fn(() => true),
        ...options
    };
    return win;
});

// Mock für ContextBridge
const mockContextBridge = {
    exposeInMainWorld: jest.fn()
};

// Mock für Dialog
const mockDialog = {
    showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
    showOpenDialogSync: jest.fn(() => []),
    showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: undefined })),
    showSaveDialogSync: jest.fn(() => undefined),
    showMessageBox: jest.fn(() => Promise.resolve({ response: 0 })),
    showMessageBoxSync: jest.fn(() => 0),
    showErrorBox: jest.fn(),
    showCertificateTrustDialog: jest.fn(() => Promise.resolve())
};

// Mock für Shell
const mockShell = {
    openExternal: jest.fn(() => Promise.resolve()),
    openPath: jest.fn(() => Promise.resolve('')),
    readShortcutLink: jest.fn(() => ({})),
    writeShortcutLink: jest.fn(() => true),
    beep: jest.fn(),
    showItemInFolder: jest.fn(),
    moveItemToTrash: jest.fn(() => true),
    openItem: jest.fn(() => true)
};

// Mock für Screen
const mockScreen = {
    getPrimaryDisplay: jest.fn(() => ({
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
        size: { width: 1920, height: 1080 },
        workAreaSize: { width: 1920, height: 1040 },
        scaleFactor: 1,
        rotation: 0,
        touchSupport: 'unknown'
    })),
    getAllDisplays: jest.fn(() => []),
    getDisplayMatching: jest.fn(() => null),
    getDisplayNearestPoint: jest.fn(() => null),
    getCursorScreenPoint: jest.fn(() => ({ x: 0, y: 0 })),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
};

// Mock für NativeImage
const mockNativeImage = {
    createEmpty: jest.fn(() => ({})),
    createFromPath: jest.fn(() => ({})),
    createFromBuffer: jest.fn(() => ({})),
    createFromDataURL: jest.fn(() => ({}))
};

// Mock für Menu
const mockMenu = jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    popup: jest.fn(),
    closePopup: jest.fn(),
    insert: jest.fn(),
    items: []
}));

mockMenu.buildFromTemplate = jest.fn(() => new mockMenu());
mockMenu.setApplicationMenu = jest.fn();
mockMenu.getApplicationMenu = jest.fn(() => null);

// Mock für MenuItem
const mockMenuItem = jest.fn().mockImplementation((options) => ({
    ...options,
    enabled: true,
    visible: true,
    checked: false
}));

// Mock für Clipboard
const mockClipboard = {
    readText: jest.fn(() => ''),
    writeText: jest.fn(),
    readHTML: jest.fn(() => ''),
    writeHTML: jest.fn(),
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
    write: jest.fn(),
    readBuffer: jest.fn(() => Buffer.alloc(0)),
    writeBuffer: jest.fn()
};

// Mock für GlobalShortcut
const mockGlobalShortcut = {
    register: jest.fn(() => true),
    registerAll: jest.fn(),
    unregister: jest.fn(),
    unregisterAll: jest.fn(),
    isRegistered: jest.fn(() => false),
    shortcuts: new Map() // für Test-Tracking
};

// Mock für Notification
const mockNotification = jest.fn().mockImplementation((options) => ({
    show: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    ...options
}));

mockNotification.isSupported = jest.fn(() => true);

// Mock für PowerMonitor
const mockPowerMonitor = {
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    getSystemIdleState: jest.fn(() => 'active'),
    getSystemIdleTime: jest.fn(() => 0),
    isOnBatteryPower: jest.fn(() => false)
};

// Mock für NativeTheme
const mockNativeTheme = {
    shouldUseDarkColors: false,
    themeSource: 'system',
    shouldUseHighContrastColors: false,
    shouldUseInvertedColorScheme: false,
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
};

// Hauptexport
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
    nativeTheme: mockNativeTheme,

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
    mockPowerMonitor,
    mockNativeTheme
};