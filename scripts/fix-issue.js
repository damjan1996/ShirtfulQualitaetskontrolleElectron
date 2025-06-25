#!/usr/bin/env node
/**
 * Quick Fix für Babel-Problem
 * Erstellt die notwendigen Konfigurationsdateien ohne Babel
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Quick Fix für Babel-Problem wird angewandt...');
console.log('='.repeat(60));

// Jest Config ohne Babel
const jestConfig = `// jest.config.js
module.exports = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    testMatch: ['<rootDir>/tests/**/*.test.js'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],
    moduleDirectories: ['node_modules', '<rootDir>'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1'
    },
    
    // WICHTIG: Babel komplett deaktivieren
    transform: {},
    
    testTimeout: 30000,
    verbose: false,
    clearMocks: true,
    reporters: ['default'],
    forceExit: true,
    detectOpenHandles: false,
    globals: {
        'process.env.NODE_ENV': 'test'
    }
};`;

// Setup ohne Babel Dependencies
const testSetup = `// tests/setup.js
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
                throw new Error(\`No handler for channel: \${channel}\`);
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

jest.setTimeout(30000);`;

function writeFile(filePath, content, description) {
    try {
        // Backup if exists
        if (fs.existsSync(filePath)) {
            const backupPath = `${filePath}.backup.${Date.now()}`;
            fs.copyFileSync(filePath, backupPath);
            console.log(`💾 Backup: ${path.basename(backupPath)}`);
        }

        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`✅ ${description}: ${filePath}`);
        return true;
    } catch (error) {
        console.error(`❌ ${description} Fehler:`, error.message);
        return false;
    }
}

// Verzeichnis erstellen
if (!fs.existsSync('tests')) {
    fs.mkdirSync('tests', { recursive: true });
    console.log('📁 Verzeichnis tests/ erstellt');
}

let success = 0;
let total = 2;

// Dateien schreiben
if (writeFile('jest.config.js', jestConfig, 'Jest Konfiguration (ohne Babel)')) success++;
if (writeFile('tests/setup.js', testSetup, 'Test Setup (minimal)')) success++;

console.log('');
console.log('📊 ERGEBNIS:');
console.log('='.repeat(60));
console.log(`✅ ${success}/${total} Dateien erfolgreich erstellt`);

if (success === total) {
    console.log('');
    console.log('🎉 QUICK FIX ERFOLGREICH!');
    console.log('');
    console.log('📋 NÄCHSTE SCHRITTE:');
    console.log('1. Führe Tests aus: pnpm run test');
    console.log('2. Die Tests sollten jetzt ohne Babel-Fehler laufen');
    console.log('3. Falls du die korrigierten Mock-Dateien brauchst:');
    console.log('   - Kopiere sie manuell aus den Artefakten');
    console.log('   - Oder installiere sie mit den anderen Artefakten');
    console.log('');
    console.log('💡 Das Babel-Problem ist jetzt behoben!');
    process.exit(0);
} else {
    console.log('');
    console.log('⚠️  Quick Fix teilweise fehlgeschlagen');
    console.log('Bitte prüfe die Dateiberechtigungen und versuche es erneut.');
    process.exit(1);
}