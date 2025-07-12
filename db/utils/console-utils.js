/**
 * Console Utilities für Qualitätskontrolle RFID QR Scanner
 * Erweiterte Logging-Funktionen mit Farben und Kategorien
 */

const fs = require('fs');
const path = require('path');

class ConsoleUtils {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.enableFileLogging = process.env.ENABLE_FILE_LOGGING === 'true';
        this.logDirectory = path.join(process.cwd(), 'logs');

        // Log-Level Hierarchie
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            database: 2,
            success: 2,
            debug: 3
        };

        // ANSI-Farbcodes
        this.colors = {
            reset: '\x1b[0m',
            bright: '\x1b[1m',
            dim: '\x1b[2m',
            red: '\x1b[31m',
            green: '\x1b[32m',
            yellow: '\x1b[33m',
            blue: '\x1b[34m',
            magenta: '\x1b[35m',
            cyan: '\x1b[36m',
            white: '\x1b[37m',
            gray: '\x1b[90m'
        };

        // Icons für verschiedene Log-Typen
        this.icons = {
            error: '❌',
            warn: '⚠️',
            info: 'ℹ️',
            success: '✅',
            database: '📊',
            debug: '🐛'
        };

        this.initializeFileLogging();
    }

    initializeFileLogging() {
        if (!this.enableFileLogging) return;

        try {
            // Logs-Verzeichnis erstellen falls nicht vorhanden
            if (!fs.existsSync(this.logDirectory)) {
                fs.mkdirSync(this.logDirectory, { recursive: true });
            }
        } catch (error) {
            console.warn('Datei-Logging konnte nicht initialisiert werden:', error.message);
            this.enableFileLogging = false;
        }
    }

    shouldLog(level) {
        const currentLevelValue = this.levels[this.logLevel] || 2;
        const messageLevelValue = this.levels[level] || 2;
        return messageLevelValue <= currentLevelValue;
    }

    formatMessage(level, message, ...args) {
        const timestamp = new Date().toISOString();
        const icon = this.icons[level] || '';
        const levelStr = level.toUpperCase().padEnd(8);

        // Basis-Message
        let formattedMessage = `[${timestamp}] [${levelStr}] ${icon} ${message}`;

        // Zusätzliche Argumente
        if (args.length > 0) {
            const additionalInfo = args.map(arg => {
                if (typeof arg === 'object') {
                    return JSON.stringify(arg, null, 2);
                }
                return String(arg);
            }).join(' ');

            formattedMessage += ` ${additionalInfo}`;
        }

        return formattedMessage;
    }

    colorize(text, color) {
        if (process.env.NODE_ENV === 'production' || !process.stdout.isTTY) {
            return text;
        }
        return `${this.colors[color] || ''}${text}${this.colors.reset}`;
    }

    writeToFile(level, formattedMessage) {
        if (!this.enableFileLogging) return;

        try {
            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.logDirectory, `${level}-${date}.log`);

            // Timestamp für Datei (ohne Farben)
            const cleanMessage = formattedMessage.replace(/\x1b\[[0-9;]*m/g, '');

            fs.appendFileSync(logFile, cleanMessage + '\n', 'utf8');
        } catch (error) {
            // Fehler beim Schreiben ignorieren (um Infinite Loops zu vermeiden)
        }
    }

    log(level, message, ...args) {
        if (!this.shouldLog(level)) return;

        const formattedMessage = this.formatMessage(level, message, ...args);

        // Console-Ausgabe mit Farben
        let consoleMessage = formattedMessage;

        switch (level) {
            case 'error':
                consoleMessage = this.colorize(formattedMessage, 'red');
                console.error(consoleMessage);
                break;
            case 'warn':
                consoleMessage = this.colorize(formattedMessage, 'yellow');
                console.warn(consoleMessage);
                break;
            case 'success':
                consoleMessage = this.colorize(formattedMessage, 'green');
                console.log(consoleMessage);
                break;
            case 'database':
                consoleMessage = this.colorize(formattedMessage, 'cyan');
                console.log(consoleMessage);
                break;
            case 'debug':
                consoleMessage = this.colorize(formattedMessage, 'gray');
                console.log(consoleMessage);
                break;
            default:
                consoleMessage = this.colorize(formattedMessage, 'blue');
                console.log(consoleMessage);
        }

        // Datei-Logging
        this.writeToFile(level, formattedMessage);
    }

    // ===== PUBLIC METHODS =====

    error(message, ...args) {
        this.log('error', message, ...args);
    }

    warning(message, ...args) {
        this.log('warn', message, ...args);
    }

    warn(message, ...args) {
        this.log('warn', message, ...args);
    }

    info(message, ...args) {
        this.log('info', message, ...args);
    }

    success(message, ...args) {
        this.log('success', message, ...args);
    }

    database(message, ...args) {
        this.log('database', message, ...args);
    }

    debug(message, ...args) {
        this.log('debug', message, ...args);
    }

    // ===== SPEZIELLE LOGGING-METHODEN =====

    logSessionEvent(event, sessionId, userId, details = {}) {
        this.info(`Session ${event}: ID=${sessionId}, User=${userId}`, details);
    }

    logQRScan(scanType, qrData, sessionId, success = true) {
        const message = `QR-Scan [${scanType}]: ${qrData.substring(0, 30)}... (Session: ${sessionId})`;

        if (success) {
            this.success(message);
        } else {
            this.error(message);
        }
    }

    logRFIDEvent(event, tagId, success = true) {
        const message = `RFID ${event}: ${tagId}`;

        if (success) {
            this.success(message);
        } else {
            this.error(message);
        }
    }

    logDatabaseQuery(sql, params, duration, success = true) {
        const truncatedSQL = sql.length > 100 ? sql.substring(0, 100) + '...' : sql;
        const message = `DB Query (${duration}ms): ${truncatedSQL}`;

        if (success) {
            this.database(message, { params });
        } else {
            this.error(message, { params });
        }
    }

    // ===== PERFORMANCE LOGGING =====

    startTimer(label) {
        const start = Date.now();
        return {
            end: () => {
                const duration = Date.now() - start;
                this.debug(`Timer [${label}]: ${duration}ms`);
                return duration;
            }
        };
    }

    logPerformance(operation, duration, threshold = 1000) {
        const level = duration > threshold ? 'warn' : 'debug';
        this.log(level, `Performance [${operation}]: ${duration}ms${duration > threshold ? ' (SLOW)' : ''}`);
    }

    // ===== ERROR LOGGING =====

    logError(error, context = '') {
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            context: context,
            timestamp: new Date().toISOString()
        };

        this.error(`Error${context ? ` in ${context}` : ''}: ${error.message}`, errorInfo);
    }

    logUnhandledError(error, type = 'uncaught') {
        this.error(`🚨 Unhandled ${type} Exception:`, {
            message: error.message,
            stack: error.stack,
            type: type,
            timestamp: new Date().toISOString()
        });
    }

    // ===== SYSTEM LOGGING =====

    logSystemInfo() {
        this.info('System Information:', {
            nodeVersion: process.version,
            platform: process.platform,
            arch: process.arch,
            memory: {
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB'
            },
            uptime: Math.round(process.uptime()) + 's'
        });
    }

    logStartup(appName, version) {
        this.success(`🚀 ${appName} v${version} gestartet`);
        this.logSystemInfo();
    }

    logShutdown(appName) {
        this.info(`🛑 ${appName} wird beendet`);
    }

    // ===== STATISTICS =====

    getLogStats() {
        if (!this.enableFileLogging) {
            return { fileLogging: false, message: 'Datei-Logging deaktiviert' };
        }

        try {
            const files = fs.readdirSync(this.logDirectory);
            const logFiles = files.filter(file => file.endsWith('.log'));

            const stats = logFiles.map(file => {
                const filePath = path.join(this.logDirectory, file);
                const stat = fs.statSync(filePath);
                return {
                    file: file,
                    size: Math.round(stat.size / 1024) + 'KB',
                    modified: stat.mtime.toISOString()
                };
            });

            return {
                fileLogging: true,
                logDirectory: this.logDirectory,
                files: stats,
                totalFiles: logFiles.length
            };
        } catch (error) {
            return {
                fileLogging: true,
                error: error.message
            };
        }
    }

    // ===== CLEANUP =====

    cleanup() {
        // Aktuell keine spezielle Cleanup-Logik erforderlich
        this.info('Console Utils Cleanup abgeschlossen');
    }

    // ===== LOG ROTATION =====

    rotateLogFiles(maxAge = 7) {
        if (!this.enableFileLogging) return;

        try {
            const files = fs.readdirSync(this.logDirectory);
            const now = Date.now();
            const maxAgeMs = maxAge * 24 * 60 * 60 * 1000; // Tage in Millisekunden

            files.forEach(file => {
                const filePath = path.join(this.logDirectory, file);
                const stat = fs.statSync(filePath);

                if (now - stat.mtime.getTime() > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    this.debug(`Alte Log-Datei gelöscht: ${file}`);
                }
            });
        } catch (error) {
            this.warn('Log-Rotation fehlgeschlagen:', error.message);
        }
    }
}

// Singleton-Instanz erstellen
const consoleUtils = new ConsoleUtils();

// Globale Error-Handler registrieren
if (typeof process !== 'undefined') {
    process.on('uncaughtException', (error) => {
        consoleUtils.logUnhandledError(error, 'uncaught');
    });

    process.on('unhandledRejection', (reason, promise) => {
        consoleUtils.logUnhandledError(reason, 'unhandledRejection');
    });
}

module.exports = consoleUtils;