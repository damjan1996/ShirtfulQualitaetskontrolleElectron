/**
 * Console-Utilities für bessere Windows-Kompatibilität
 */

const os = require('os');

class ConsoleUtils {
    constructor() {
        this.isWindows = process.platform === 'win32';
        this.supportsUnicode = false; // Deaktiviert für Windows-Kompatibilität
        this.setupConsole();
    }

    setupConsole() {
        if (this.isWindows) {
            try {
                // Windows Console auf UTF-8 setzen falls möglich
                process.stdout.setEncoding('utf8');
                process.stderr.setEncoding('utf8');
            } catch (error) {
                // Fallback bei Fehlern
                this.supportsUnicode = false;
            }
        }
    }

    // ASCII-Symbole für Windows-Kompatibilität
    getSymbol(type) {
        const symbols = {
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
        return symbols[type] || symbols.bullet;
    }

    // Erweiterte Logging-Funktionen
    log(level, message, ...args) {
        const symbol = this.getSymbol(level);
        const timestamp = new Date().toLocaleTimeString('de-DE');

        // Einfache Ausgabe ohne Farben für Windows-Kompatibilität
        const logLine = `${symbol} ${message}`;

        if (args.length > 0) {
            console.log(logLine, ...args);
        } else {
            console.log(logLine);
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
        return `[${'#'.repeat(filled)}${'-'.repeat(empty)}]`;
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

// Singleton-Instanz mit korrekter Fehlerbehandlung
let consoleUtils;
try {
    consoleUtils = new ConsoleUtils();
} catch (error) {
    // Fallback auf Standard-Console
    consoleUtils = {
        success: console.log.bind(console, '[OK]'),
        error: console.error.bind(console, '[ERROR]'),
        warning: console.warn.bind(console, '[WARN]'),
        info: console.log.bind(console, '[INFO]'),
        database: console.log.bind(console, '[DB]'),
        rfid: console.log.bind(console, '[RFID]'),
        log: (level, message, ...args) => console.log(`[${level.toUpperCase()}] ${message}`, ...args),
        getDiagnostics: () => ({ error: 'Console utils failed to initialize' })
    };
}

module.exports = consoleUtils;