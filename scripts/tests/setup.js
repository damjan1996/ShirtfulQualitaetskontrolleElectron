// tests/setup.js
process.on('unhandledRejection', () => {}); // Silence test rejections

beforeEach(() => {
    delete global.mockElectron;
    process.env.NODE_ENV = 'test';
    jest.clearAllTimers();
    
    global.mockElectron = {
        globalShortcut: {
            shortcuts: new Map(),
            register: jest.fn(() => true),
            unregister: jest.fn(() => true),
            unregisterAll: jest.fn(),
            triggerShortcut: (shortcut) => {
                const callback = global.mockElectron.globalShortcut.shortcuts.get(shortcut);
                if (callback) callback();
            }
        },
        ipcMain: {
            handlers: new Map(),
            invoke: jest.fn(async (channel, ...args) => {
                const handler = global.mockElectron.ipcMain.handlers.get(channel);
                if (handler) return await handler(...args);
                throw new Error(`No handler for channel: ${channel}`);
            }),
            handle: jest.fn((channel, handler) => {
                global.mockElectron.ipcMain.handlers.set(channel, handler);
            })
        }
    };
});

afterEach(() => {
    jest.clearAllTimers();
    if (global.mockElectron) {
        global.mockElectron.globalShortcut.unregisterAll();
        global.mockElectron.ipcMain.handlers.clear();
    }
    jest.clearAllMocks();
});

jest.setTimeout(30000);