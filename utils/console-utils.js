/**
 * Console-Utilities für bessere Windows-Kompatibilität
 */

const os = require('os');

class ConsoleUtils {
    constructor() {
        this.isWindows = process.platform === 'win32';
        this.supportsUnicode = this.checkUnicodeSupport();
        this.setupConsole();
    }

    checkUnicodeSupport() {
        try {
            // Teste ob Unicode-Ausgabe funktioniert
            if (this.isWindows) {
                // Windows: Prüfe ob UTF-8 Code Page aktiv ist
                const { execSync } = require('child_process');
                try {
                    const codepage = execSync('chcp', { encoding: 'utf8' }).toString();
                    return codepage.includes('65001'); // UTF-8
                } catch (error) {
                    return false;
                }
            }
            return true; // Unix-Systeme unterstützen normalerweise UTF-8
        } catch (error) {
            return false;
        }
    }

    setupConsole() {
        if (this.isWindows) {
            try {
                // Versuche UTF-8 Code Page zu setzen
                process.stdout.setEncoding('utf8');
                process.stderr.setEncoding('utf8');

                // Windows Console API verwenden falls verfügbar
                if (process.stdout.isTTY) {
                    process.stdout.write('\x1b]0;RFID Wareneingang - Shirtful\x07');
                }
            } catch (error) {
                // Fallback bei Fehlern
                this.supportsUnicode = false;
            }
        }
    }

    // Emoji/Symbol-Fallbacks für Windows
    getSymbol(type) {
        if (this.supportsUnicode) {
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
        } else {
            // ASCII-Fallbacks für Systeme ohne Unicode-Support
            const fallbacks = {
                success: '[OK]',
                error: '[FEHLER]',
                warning: '[WARNUNG]',
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
        }
    }

    // Erweiterte Logging-Funktionen
    log(level, message, ...args) {
        const symbol = this.getSymbol(level);
        const timestamp = new Date().toLocaleTimeString('de-DE');

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

        if (process.stdout.isTTY && !this.isWindows) {
            console.log(`${color}${symbol} ${message}${reset}`, ...args);
        } else {
            console.log(`${symbol} ${message}`, ...args);
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

    // Progress-Anzeige
    showProgress(current, total, message = '') {
        const percentage = Math.round((current / total) * 100);
        const bar = this.createProgressBar(percentage);

        if (message) {
            console.log(`${this.getSymbol('loading')} ${message} ${bar} ${percentage}%`);
        } else {
            console.log(`${bar} ${percentage}%`);
        }
    }

    createProgressBar(percentage, width = 20) {
        const filled = Math.round((percentage / 100) * width);
        const empty = width - filled;

        if (this.supportsUnicode) {
            return `[${'█'.repeat(filled)}${'░'.repeat(empty)}]`;
        } else {
            return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
        }
    }

    // Tabellen-Ausgabe
    table(data, headers = null) {
        if (!Array.isArray(data) || data.length === 0) {
            this.info('Keine Daten zum Anzeigen');
            return;
        }

        const keys = headers || Object.keys(data[0]);
        const maxWidths = {};

        // Maximale Spaltenbreiten berechnen
        keys.forEach(key => {
            maxWidths[key] = Math.max(
                key.length,
                ...data.map(row => String(row[key] || '').length)
            );
        });

        // Header ausgeben
        const headerRow = keys.map(key =>
            key.padEnd(maxWidths[key])
        ).join(' | ');

        console.log(headerRow);
        console.log(keys.map(key => '-'.repeat(maxWidths[key])).join('-+-'));

        // Datenzeilen ausgeben
        data.forEach(row => {
            const dataRow = keys.map(key =>
                String(row[key] || '').padEnd(maxWidths[key])
            ).join(' | ');
            console.log(dataRow);
        });
    }

    // Banner/Header
    printBanner(title, subtitle = null) {
        const width = Math.max(title.length, subtitle ? subtitle.length : 0) + 4;
        const border = '='.repeat(width);

        console.log(border);
        console.log(`  ${title}`);
        if (subtitle) {
            console.log(`  ${subtitle}`);
        }
        console.log(border);
        console.log();
    }

    // Separator
    separator(char = '-', length = 50) {
        console.log(char.repeat(length));
    }

    // Clear screen (falls unterstützt)
    clear() {
        if (process.stdout.isTTY) {
            console.clear();
        } else {
            console.log('\n'.repeat(5));
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
}

// Singleton-Instanz
const consoleUtils = new ConsoleUtils();

module.exports = consoleUtils;