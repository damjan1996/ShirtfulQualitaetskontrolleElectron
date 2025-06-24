// tests/mocks/electron.mock.js
/**
 * Electron Mock für Jest Tests
 * Simuliert Electron APIs ohne echte Desktop-Anwendung
 */

const mockWebContents = {
    send: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    openDevTools: jest.fn(),
    closeDevTools: jest.fn(),
    isDevToolsOpened: jest.fn(() => false),
    toggleDevTools: jest.fn(),
    reload: jest.fn(),
    focus: jest.fn()
};

const mockBrowserWindow = jest.fn().mockImplementation(() => ({
    loadFile: jest.fn(() => Promise.resolve()),
    loadURL: jest.fn(() => Promise.resolve()),
    show: jest.fn(),
    hide: jest.fn(),
    close: jest.fn(),
    minimize: jest.fn(),
    maximize: jest.fn(),
    unmaximize: jest.fn(),
    restore: jest.fn(),
    focus: jest.fn(),
    blur: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
    webContents: mockWebContents,
    isMinimized: jest.fn(() => false),
    isMaximized: jest.fn(() => false),
    isFullScreen: jest.fn(() => false),
    isVisible: jest.fn(() => true),
    isFocused: jest.fn(() => false),
    isDestroyed: jest.fn(() => false),
    getBounds: jest.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
    setBounds: jest.fn(),
    getSize: jest.fn(() => [800, 600]),
    setSize: jest.fn(),
    getPosition: jest.fn(() => [0, 0]),
    setPosition: jest.fn(),
    center: jest.fn(),
    setTitle: jest.fn(),
    getTitle: jest.fn(() => 'Test Window'),
    setMenuBarVisibility: jest.fn(),
    setAutoHideMenuBar: jest.fn(),
    setIcon: jest.fn()
}));

const mockApp = {
    getVersion: jest.fn(() => '1.0.0'),
    getName: jest.fn(() => 'Test App'),
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

const mockIpcMain = {
    handle: jest.fn(),
    handleOnce: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeHandler: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
};

const mockIpcRenderer = {
    invoke: jest.fn(() => Promise.resolve()),
    on: jest.fn(),
    once: jest.fn(),
    send: jest.fn(),
    sendSync: jest.fn(() => null),
    sendTo: jest.fn(),
    sendToHost: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn()
};

const mockDialog = {
    showErrorBox: jest.fn(),
    showMessageBox: jest.fn(() => Promise.resolve({ response: 0, checkboxChecked: false })),
    showMessageBoxSync: jest.fn(() => 0),
    showOpenDialog: jest.fn(() => Promise.resolve({ canceled: false, filePaths: [] })),
    showOpenDialogSync: jest.fn(() => []),
    showSaveDialog: jest.fn(() => Promise.resolve({ canceled: false, filePath: '' })),
    showSaveDialogSync: jest.fn(() => ''),
    showCertificateTrustDialog: jest.fn(() => Promise.resolve())
};

const mockShell = {
    showItemInFolder: jest.fn(),
    openPath: jest.fn(() => Promise.resolve('')),
    openExternal: jest.fn(() => Promise.resolve()),
    moveItemToTrash: jest.fn(() => Promise.resolve(true)),
    beep: jest.fn(),
    writeShortcutLink: jest.fn(() => true),
    readShortcutLink: jest.fn(() => ({}))
};

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
        touchSupport: 'unknown'
    })),
    getAllDisplays: jest.fn(() => []),
    getDisplayNearestPoint: jest.fn(() => ({})),
    getDisplayMatching: jest.fn(() => ({})),
    on: jest.fn(),
    removeListener: jest.fn()
};

const mockNativeImage = {
    createEmpty: jest.fn(() => ({})),
    createFromPath: jest.fn(() => ({})),
    createFromBuffer: jest.fn(() => ({})),
    createFromDataURL: jest.fn(() => ({})),
    createFromNamedImage: jest.fn(() => ({}))
};

const mockMenu = {
    buildFromTemplate: jest.fn(() => ({})),
    setApplicationMenu: jest.fn(),
    getApplicationMenu: jest.fn(() => null),
    sendActionToFirstResponder: jest.fn()
};

const mockMenuItem = jest.fn().mockImplementation(() => ({
    click: jest.fn(),
    enabled: true,
    visible: true,
    checked: false
}));

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

const mockGlobalShortcut = {
    register: jest.fn(() => true),
    registerAll: jest.fn(),
    isRegistered: jest.fn(() => false),
    unregister: jest.fn(),
    unregisterAll: jest.fn()
};

module.exports = {
    app: mockApp,
    BrowserWindow: mockBrowserWindow,
    ipcMain: mockIpcMain,
    ipcRenderer: mockIpcRenderer,
    dialog: mockDialog,
    shell: mockShell,
    screen: mockScreen,
    nativeImage: mockNativeImage,
    Menu: mockMenu,
    MenuItem: mockMenuItem,
    clipboard: mockClipboard,
    globalShortcut: mockGlobalShortcut,

    // Electron Konstanten
    PLATFORM: 'win32',
    remote: {
        app: mockApp,
        BrowserWindow: mockBrowserWindow,
        dialog: mockDialog,
        shell: mockShell,
        screen: mockScreen,
        Menu: mockMenu,
        MenuItem: mockMenuItem,
        clipboard: mockClipboard,
        globalShortcut: mockGlobalShortcut
    }
};