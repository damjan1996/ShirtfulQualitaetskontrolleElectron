/**
 * Console-Utilities für bessere Windows-Kompatibilität
 * Fixed für Windows Console Encoding Issues
 */

const os = require('os');

class ConsoleUtils {
    constructor() {
        this.isWindows = process.platform === 'win32';
        this.supportsUnicode = this.checkUnicodeSupport();
        this.originalConsole = {
            log: console.log,
            error: console.error,
            warn: console.warn,
            info: console.info
        };
        this.setupConsole();
    }

    checkUnicodeSupport() {
        try {
            // Für Windows: Verwende ASCII-Fallbacks
            if (this.isWindows) {
                return false; // Deaktiviere Unicode für Windows
            }
            return true; // Unix-Systeme unterstützen normalerweise UTF-8
        } catch (error) {
            return false;
        }
    }

    setupConsole() {
        if (this.isWindows) {
            try {
                // Windows Console UTF-8 Setup - vorsichtiger Ansatz
                if (process.stdout && process.stdout.setEncoding) {
                    process.stdout.setEncoding('utf8');
                }
                if (process.stderr && process.stderr.setEncoding) {
                    process.stderr.setEncoding('utf8');
                }
            } catch (error) {
                // Ignoriere Encoding-Fehler
                console.warn('Console encoding setup failed:', error.message);
            }
        }
    }

    // Emoji/Symbol-Fallbacks für Windows
    getSymbol(type) {
        // Für Windows: Immer ASCII verwenden
        if (this.isWindows || !this.supportsUnicode) {
            const fallbacks = {
                success: '[OK]',
                error: '[ERROR]',
                warning: '[WARN]',
                info: '[INFO]',
                loading: '[...]',
                database: '[DB]',
                rfid: '[RFID]',
                qr: '[QR]',
                user: '[USER]',
                time: '[TIME]',
                clean: '[CLEAN]',
                rocket: '[START]',
                gear: '[CONFIG]',
                lock: '[LOCKED]',
                unlock: '[UNLOCKED]',
                camera: '[CAM]',
                package: '[PKG]',
                check: '[+]',
                cross: '[-]',
                arrow: '->',
                bullet: '*'
            };
            return fallbacks[type] || fallbacks.bullet;
        } else {
            // Unicode für Unix-Systeme
            const symbols = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️',
                loading: '🔄',
                database: '📊',
                rfid: '🏷️',
                qr: '📱',
                user: '👤',
                time: '⏰',
                clean: '🧹',
                rocket: '🚀',
                gear: '⚙️',
                lock: '🔒',
                unlock: '🔓',
                camera: '📷',
                package: '📦',
                check: '✓',
                cross: '✗',
                arrow: '→',
                bullet: '•'
            };
            return symbols[type] || symbols.bullet;
        }
    }

    // Verbesserte Logging-Funktionen
    log(level, message, ...args) {
        const symbol = this.getSymbol(level);
        const timestamp = new Date().toLocaleTimeString('de-DE');

        // Für Windows: Einfache Ausgabe ohne Farben
        if (this.isWindows) {
            this.originalConsole.log(`${symbol} ${message}`, ...args);
        } else {
            // Unix: Mit Farben
            const levelColors = {
                success: '\x1b[32m', // Grün
                error: '\x1b[31m',   // Rot
                warning: '\x1b[33m', // Gelb
                info: '\x1b[36m',    // Cyan
                loading: '\x1b[35m', // Magenta
                database: '\x1b[34m', // Blau
                rfid: '\x1b[32m'     // Grün
            };

            const color = levelColors[level] || '\x1b[0m';
            const reset = '\x1b[0m';

            this.originalConsole.log(`${color}${symbol} ${message}${reset}`, ...args);
        }
    }

    success(message, ...args) {
        this.log('success', message, ...args);
    }

    error(message, ...args) {
        this.log('error', message, ...args);
    }

    warning(message, ...args) {
        this.log('warning', message, ...args);
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    loading(message, ...args) {
        this.log('loading', message, ...args);
    }

    database(message, ...args) {
        this.log('database', message, ...args);
    }

    rfid(message, ...args) {
        this.log('rfid', message, ...args);
    }

    // Sichere Console-Methoden (keine Überschreibung der globalen console)
    safeLog(message, ...args) {
        try {
            // Verwende ursprüngliche console.log
            this.originalConsole.log(message, ...args);
        } catch (error) {
            // Fallback bei Console-Fehlern
            try {
                process.stdout.write(message + '\n');
            } catch (writeError) {
                // Letzte Rettung - tue nichts
            }
        }
    }

    safeError(message, ...args) {
        try {
            this.originalConsole.error(message, ...args);
        } catch (error) {
            try {
                process.stderr.write(message + '\n');
            } catch (writeError) {
                // Letzte Rettung - tue nichts
            }
        }
    }

    // Progress-Anzeige
    showProgress(current, total, message = '') {
        const percentage = Math.round((current / total) * 100);
        const bar = this.createProgressBar(percentage);

        if (message) {
            this.safeLog(`${this.getSymbol('loading')} ${message} ${bar} ${percentage}%`);
        } else {
            this.safeLog(`${bar} ${percentage}%`);
        }
    }

    createProgressBar(percentage, width = 20) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;

        // Immer ASCII für maximale Kompatibilität
        return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
    }

    // Banner/Header
    printBanner(title, subtitle = null) {
        const width = Math.max(title.length, subtitle ? subtitle.length : 0) + 4;
        const border = '='.repeat(width);

        this.safeLog(border);
        this.safeLog(`  ${title}`);
        if (subtitle) {
            this.safeLog(`  ${subtitle}`);
        }
        this.safeLog(border);
        this.safeLog('');
    }

    // Separator
    separator(char = '-', length = 50) {
        this.safeLog(char.repeat(length));
    }

    // Clear screen (falls unterstützt)
    clear() {
        if (process.stdout.isTTY) {
            try {
                console.clear();
            } catch (error) {
                this.safeLog('\n'.repeat(5));
            }
        } else {
            this.safeLog('\n'.repeat(5));
        }
    }

    // Diagnostik-Info
    getDiagnostics() {
        return {
            platform: process.platform,
            isWindows: this.isWindows,
            supportsUnicode: this.supportsUnicode,
            isTTY: process.stdout.isTTY,
            encoding: {
                stdout: process.stdout.encoding,
                stderr: process.stderr.encoding
            },
            environment: {
                TERM: process.env.TERM,
                FORCE_COLOR: process.env.FORCE_COLOR,
                NO_COLOR: process.env.NO_COLOR
            }
        };
    }

    // Test-Methode für Console-Ausgabe
    testOutput() {
        this.safeLog('=== CONSOLE TEST ===');
        this.success('Success message test');
        this.error('Error message test');
        this.warning('Warning message test');
        this.info('Info message test');
        this.database('Database message test');
        this.rfid('RFID message test');
        this.safeLog('=== TEST COMPLETE ===');
    }
}

// Singleton-Instanz
const consoleUtils = new ConsoleUtils();

module.exports = consoleUtils;