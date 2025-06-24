const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
require('dotenv').config();

// Console-Encoding für Windows setzen
if (process.platform === 'win32') {
    try {
        process.stdout.setEncoding('utf8');
        process.stderr.setEncoding('utf8');
    } catch (error) {
        // Encoding setzen fehlgeschlagen - nicht kritisch
    }
}

// Nur sichere Module laden
const DatabaseClient = require('./db/db-client');

// Simple RFID Listener laden (ohne native Dependencies)
let SimpleRFIDListener;
try {
    SimpleRFIDListener = require('./rfid/simple-rfid-listener');
    console.log('✅ Simple RFID Listener geladen');
} catch (error) {
    console.warn('⚠️ Simple RFID Listener nicht verfügbar:', error.message);
    console.log('💡 App läuft ohne RFID-Support');
}

class WareneingangMainApp {
    constructor() {
        this.mainWindow = null;
        this.rfidListener = null;
        this.dbClient = null;

        // Status-Tracking
        this.systemStatus = {
            database: false,
            rfid: false,
            lastError: null
        };

        // Session-Management (vereinfacht)
        this.currentSession = null;

        // QR-Scan Rate Limiting
        this.qrScanRateLimit = new Map();
        this.maxQRScansPerMinute = 20; // Verhindere übermäßige Scans

        this.initializeApp();
    }

    initializeApp() {
        // Hardware-Beschleunigung für bessere Kompatibilität anpassen
        app.commandLine.appendSwitch('--disable-gpu-process-crash-limit');
        app.commandLine.appendSwitch('--disable-gpu-sandbox');
        app.commandLine.appendSwitch('--disable-software-rasterizer');
        app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');

        // Für Windows: GPU-Probleme vermeiden
        if (process.platform === 'win32') {
            app.commandLine.appendSwitch('--disable-gpu');
            app.commandLine.appendSwitch('--disable-gpu-compositing');
        }

        // App bereit
        app.whenReady().then(() => {
            this.createMainWindow();
            this.initializeComponents();

            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createMainWindow();
                }
            });
        });

        // App-Events
        app.on('window-all-closed', () => {
            this.cleanup();
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('before-quit', () => {
            this.cleanup();
        });

        // IPC-Handler einrichten
        this.setupIPCHandlers();
    }

    createMainWindow() {
        const windowWidth = parseInt(process.env.UI_WINDOW_WIDTH) || 1400;
        const windowHeight = parseInt(process.env.UI_WINDOW_HEIGHT) || 900;

        this.mainWindow = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            minWidth: 1200,
            minHeight: 700,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                enableRemoteModule: false,
                webSecurity: true,
                // GPU-Problem-Workarounds
                disableBlinkFeatures: 'Accelerated2dCanvas,AcceleratedSmallCanvases',
                enableBlinkFeatures: '',
                hardwareAcceleration: false
            },
            show: false,
            title: 'RFID Wareneingang - Shirtful',
            autoHideMenuBar: true,
            frame: true,
            titleBarStyle: 'default',
            // Windows-spezifische Optionen
            ...(process.platform === 'win32' && {
                icon: path.join(__dirname, 'assets/icon.ico')
            })
        });

        // Renderer laden
        this.mainWindow.loadFile('renderer/index.html');

        // Fenster anzeigen wenn bereit
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();

            // Development Tools
            if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        // Fenster geschlossen
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // Prevent navigation away from the app
        this.mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
            const parsedUrl = new URL(navigationUrl);
            if (parsedUrl.origin !== 'file://') {
                event.preventDefault();
            }
        });

        // WebContents-Fehler abfangen
        this.mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.error('Renderer-Prozess abgestürzt:', details);

            if (details.reason !== 'clean-exit') {
                dialog.showErrorBox(
                    'Anwendungsfehler',
                    'Die Anwendung ist unerwartet beendet worden. Sie wird neu gestartet.'
                );

                // Neustart nach kurzer Verzögerung
                setTimeout(() => {
                    this.createMainWindow();
                }, 1000);
            }
        });
    }

    async initializeComponents() {
        console.log('🔄 Initialisiere Systemkomponenten...');

        // Datenbank zuerst
        await this.initializeDatabase();

        // RFID-Listener (mit Fallback)
        await this.initializeRFID();

        // System-Status an Renderer senden
        this.sendSystemStatus();

        console.log('✅ Systemkomponenten initialisiert');
    }

    async initializeDatabase() {
        try {
            console.log('📊 Initialisiere Datenbankverbindung...');

            this.dbClient = new DatabaseClient();
            await this.dbClient.connect();

            // Health Check
            const health = await this.dbClient.healthCheck();
            if (!health.connected) {
                throw new Error(health.error || 'Gesundheitsprüfung fehlgeschlagen');
            }

            this.systemStatus.database = true;
            this.systemStatus.lastError = null;

            console.log('✅ Datenbank erfolgreich verbunden');

        } catch (error) {
            this.systemStatus.database = false;
            this.systemStatus.lastError = `Datenbank: ${error.message}`;

            console.error('❌ Datenbank-Initialisierung fehlgeschlagen:', error);

            // Benutzer informieren
            if (this.mainWindow) {
                dialog.showErrorBox(
                    'Datenbank-Verbindung fehlgeschlagen',
                    `Verbindung zur Datenbank konnte nicht hergestellt werden:\n\n${error.message}\n\n` +
                    'Bitte überprüfen Sie:\n' +
                    '• Netzwerkverbindung\n' +
                    '• .env Konfiguration\n' +
                    '• SQL Server Verfügbarkeit'
                );
            }
        }
    }

    async initializeRFID() {
        try {
            console.log('🏷️ Initialisiere RFID-Listener...');

            if (!SimpleRFIDListener) {
                throw new Error('Simple RFID-Listener nicht verfügbar');
            }

            this.rfidListener = new SimpleRFIDListener((tagId) => {
                this.handleRFIDScan(tagId);
            });

            const started = await this.rfidListener.start();

            if (started) {
                this.systemStatus.rfid = true;
                console.log('✅ RFID-Listener erfolgreich gestartet');
            } else {
                throw new Error('RFID-Listener konnte nicht gestartet werden');
            }

        } catch (error) {
            this.systemStatus.rfid = false;
            this.systemStatus.lastError = `RFID: ${error.message}`;

            console.error('❌ RFID-Initialisierung fehlgeschlagen:', error);
            console.log('💡 RFID-Alternativen:');
            console.log('   1. Tags manuell in der UI simulieren');
            console.log('   2. Entwickler-Console für Tests verwenden');
            console.log('   3. Hardware später konfigurieren');

            // RFID ist nicht kritisch - App kann ohne laufen
        }
    }

    setupIPCHandlers() {
        // ===== DATENBANK OPERATIONEN =====
        ipcMain.handle('db-query', async (event, query, params) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    throw new Error('Datenbank nicht verbunden');
                }
                return await this.dbClient.query(query, params);
            } catch (error) {
                console.error('DB Query Fehler:', error);
                throw error;
            }
        });

        ipcMain.handle('db-get-user-by-epc', async (event, tagId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return null;
                }
                return await this.dbClient.getUserByEPC(tagId);
            } catch (error) {
                console.error('Get User by EPC Fehler:', error);
                return null;
            }
        });

        // ===== SESSION MANAGEMENT =====
        ipcMain.handle('session-create', async (event, userId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    throw new Error('Datenbank nicht verbunden');
                }

                // Bestehende Session beenden
                await this.endExistingUserSession(userId);

                // Neue Session erstellen
                const session = await this.dbClient.createSession(userId);

                if (session) {
                    this.currentSession = {
                        sessionId: session.ID,
                        userId: userId,
                        startTime: session.StartTS
                    };

                    // Zeitstempel normalisieren für konsistente Übertragung
                    const normalizedSession = {
                        ...session,
                        StartTS: this.normalizeTimestamp(session.StartTS)
                    };

                    console.log('Session erstellt mit normalisiertem Zeitstempel:', normalizedSession.StartTS);
                    return normalizedSession;
                }

                return session;
            } catch (error) {
                console.error('Session Create Fehler:', error);
                return null;
            }
        });

        ipcMain.handle('session-end', async (event, sessionId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return false;
                }

                const success = await this.dbClient.endSession(sessionId);

                if (success && this.currentSession && this.currentSession.sessionId === sessionId) {
                    this.currentSession = null;
                }

                return success;
            } catch (error) {
                console.error('Session End Fehler:', error);
                return false;
            }
        });

        // ===== QR-CODE OPERATIONEN MIT RATE LIMITING =====
        ipcMain.handle('qr-scan-save', async (event, sessionId, payload) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    throw new Error('Datenbank nicht verbunden');
                }

                // Rate Limiting prüfen
                if (!this.checkQRScanRateLimit(sessionId)) {
                    throw new Error('Zu viele QR-Scans pro Minute - bitte warten Sie');
                }

                // Payload bereinigen (BOM entfernen falls vorhanden)
                const cleanPayload = payload.replace(/^\ufeff/, '');

                const result = await this.dbClient.saveQRScan(sessionId, cleanPayload);

                // Rate Limit Counter aktualisieren
                this.updateQRScanRateLimit(sessionId);

                return result;
            } catch (error) {
                console.error('QR Scan Save Fehler:', error);

                // Spezielle Behandlung für Duplikat-Fehler
                if (error.message.includes('bereits gescannt') ||
                    error.message.includes('Duplikat') ||
                    error.message.includes('bereits verarbeitet')) {

                    // Nicht als systemkritischen Fehler behandeln
                    return null;
                }

                throw error;
            }
        });

        // ===== SYSTEM STATUS =====
        ipcMain.handle('get-system-status', async (event) => {
            return {
                database: this.systemStatus.database,
                rfid: this.systemStatus.rfid,
                lastError: this.systemStatus.lastError,
                currentSession: this.currentSession,
                uptime: Math.floor(process.uptime()),
                timestamp: new Date().toISOString(),
                qrScanStats: this.getQRScanStats()
            };
        });

        ipcMain.handle('get-system-info', async (event) => {
            return {
                version: app.getVersion() || '1.0.0',
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                platform: process.platform,
                arch: process.arch,
                env: process.env.NODE_ENV || 'production'
            };
        });

        // ===== RFID OPERATIONEN =====
        ipcMain.handle('rfid-get-status', async (event) => {
            return this.rfidListener ? this.rfidListener.getStatus() : {
                listening: false,
                type: 'not-available',
                message: 'RFID-Listener nicht verfügbar'
            };
        });

        ipcMain.handle('rfid-simulate-tag', async (event, tagId) => {
            try {
                if (!this.rfidListener) {
                    // Direkte Simulation wenn kein Listener verfügbar
                    console.log(`🧪 Direkte RFID-Simulation: ${tagId}`);
                    await this.handleRFIDScan(tagId);
                    return true;
                }
                return this.rfidListener.simulateTag(tagId);
            } catch (error) {
                console.error('RFID Simulate Fehler:', error);
                return false;
            }
        });

        // ===== APP STEUERUNG =====
        ipcMain.handle('app-minimize', () => {
            if (this.mainWindow) {
                this.mainWindow.minimize();
            }
        });

        ipcMain.handle('app-close', () => {
            app.quit();
        });

        ipcMain.handle('app-restart', () => {
            app.relaunch();
            app.exit();
        });
    }

    // ===== ZEITSTEMPEL NORMALISIERUNG =====
    normalizeTimestamp(timestamp) {
        try {
            let date;

            if (timestamp instanceof Date) {
                date = timestamp;
            } else if (typeof timestamp === 'string') {
                date = new Date(timestamp);
            } else {
                date = new Date(timestamp);
            }

            // Prüfe auf gültiges Datum
            if (isNaN(date.getTime())) {
                console.warn('Ungültiger Zeitstempel für Normalisierung:', timestamp);
                date = new Date(); // Fallback auf aktuelle Zeit
            }

            // ISO-String für konsistente Übertragung
            return date.toISOString();

        } catch (error) {
            console.error('Fehler bei Zeitstempel-Normalisierung:', error, timestamp);
            return new Date().toISOString(); // Fallback
        }
    }

    // ===== QR-SCAN RATE LIMITING =====
    checkQRScanRateLimit(sessionId) {
        const now = Date.now();
        const oneMinute = 60 * 1000;

        if (!this.qrScanRateLimit.has(sessionId)) {
            this.qrScanRateLimit.set(sessionId, []);
        }

        const scanTimes = this.qrScanRateLimit.get(sessionId);

        // Entferne Scans älter als 1 Minute
        const recentScans = scanTimes.filter(time => now - time < oneMinute);
        this.qrScanRateLimit.set(sessionId, recentScans);

        // Prüfe Limit
        return recentScans.length < this.maxQRScansPerMinute;
    }

    updateQRScanRateLimit(sessionId) {
        const now = Date.now();

        if (!this.qrScanRateLimit.has(sessionId)) {
            this.qrScanRateLimit.set(sessionId, []);
        }

        const scanTimes = this.qrScanRateLimit.get(sessionId);
        scanTimes.push(now);

        // Halte nur die letzten Scans
        if (scanTimes.length > this.maxQRScansPerMinute) {
            scanTimes.shift();
        }
    }

    getQRScanStats() {
        const stats = {};
        const now = Date.now();
        const oneMinute = 60 * 1000;

        for (const [sessionId, scanTimes] of this.qrScanRateLimit.entries()) {
            const recentScans = scanTimes.filter(time => now - time < oneMinute);
            stats[sessionId] = {
                scansPerMinute: recentScans.length,
                lastScan: scanTimes.length > 0 ? Math.max(...scanTimes) : null
            };
        }

        return stats;
    }

    // ===== RFID HANDLING =====
    async handleRFIDScan(tagId) {
        console.log(`🏷️ RFID-Tag gescannt: ${tagId}`);

        try {
            if (!this.systemStatus.database) {
                throw new Error('Datenbank nicht verbunden - RFID-Scan kann nicht verarbeitet werden');
            }

            // Benutzer anhand EPC finden
            const user = await this.dbClient.getUserByEPC(tagId);

            if (!user) {
                this.sendToRenderer('rfid-scan-error', {
                    tagId,
                    message: `Unbekannter RFID-Tag: ${tagId}`,
                    timestamp: new Date().toISOString()
                });
                return;
            }

            // Prüfen ob Benutzer bereits eine aktive Session hat
            const hasActiveSession = this.currentSession && this.currentSession.userId === user.ID;

            if (hasActiveSession) {
                // Benutzer abmelden
                const success = await this.dbClient.endSession(this.currentSession.sessionId);

                if (success) {
                    const oldSession = this.currentSession;
                    this.currentSession = null;

                    // Rate Limit für Session zurücksetzen
                    this.qrScanRateLimit.delete(oldSession.sessionId);

                    this.sendToRenderer('user-logout', {
                        user,
                        sessionId: oldSession.sessionId,
                        timestamp: new Date().toISOString()
                    });

                    console.log(`👋 Benutzer abgemeldet: ${user.BenutzerName}`);
                }
            } else {
                // Benutzer anmelden
                const session = await this.dbClient.createSession(user.ID);

                if (session) {
                    this.currentSession = {
                        sessionId: session.ID,
                        userId: user.ID,
                        startTime: session.StartTS
                    };

                    // Rate Limit für neue Session initialisieren
                    this.qrScanRateLimit.set(session.ID, []);

                    // Session-Daten mit normalisiertem Zeitstempel senden
                    const normalizedSession = {
                        ...session,
                        StartTS: this.normalizeTimestamp(session.StartTS)
                    };

                    this.sendToRenderer('user-login', {
                        user,
                        session: normalizedSession,
                        timestamp: new Date().toISOString()
                    });

                    console.log(`✅ Benutzer angemeldet: ${user.BenutzerName} (Session-Start: ${normalizedSession.StartTS})`);
                } else {
                    this.sendToRenderer('rfid-scan-error', {
                        tagId,
                        message: 'Session konnte nicht erstellt werden',
                        timestamp: new Date().toISOString()
                    });
                }
            }

        } catch (error) {
            console.error('RFID-Scan Verarbeitung fehlgeschlagen:', error);
            this.sendToRenderer('rfid-scan-error', {
                tagId,
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async endExistingUserSession(userId) {
        try {
            if (this.currentSession && this.currentSession.userId === userId) {
                await this.dbClient.endSession(this.currentSession.sessionId);

                // Rate Limit zurücksetzen
                this.qrScanRateLimit.delete(this.currentSession.sessionId);

                this.currentSession = null;
            }

            // Zusätzlich: Alle aktiven Sessions des Benutzers in DB beenden
            await this.dbClient.query(`
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE UserID = ? AND Active = 1
            `, [userId]);

        } catch (error) {
            console.error('Bestehende Session beenden fehlgeschlagen:', error);
        }
    }

    // ===== COMMUNICATION =====
    sendToRenderer(channel, data) {
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    sendSystemStatus() {
        this.sendToRenderer('system-ready', {
            database: this.systemStatus.database,
            rfid: this.systemStatus.rfid,
            lastError: this.systemStatus.lastError,
            timestamp: new Date().toISOString()
        });
    }

    // ===== CLEANUP =====
    async cleanup() {
        console.log('🧹 Anwendung wird bereinigt...');

        try {
            // Aktuelle Session beenden
            if (this.currentSession) {
                await this.dbClient.endSession(this.currentSession.sessionId);
                this.currentSession = null;
            }

            // Rate Limits zurücksetzen
            this.qrScanRateLimit.clear();

            // RFID-Listener stoppen
            if (this.rfidListener) {
                await this.rfidListener.stop();
                this.rfidListener = null;
            }

            // Alle globalen Shortcuts entfernen
            globalShortcut.unregisterAll();

            // Datenbankverbindung schließen
            if (this.dbClient) {
                await this.dbClient.close();
                this.dbClient = null;
            }

            console.log('✅ Cleanup abgeschlossen');

        } catch (error) {
            console.error('❌ Cleanup-Fehler:', error);
        }
    }

    // ===== ERROR HANDLING =====
    handleGlobalError(error) {
        console.error('Globaler Anwendungsfehler:', error);

        this.sendToRenderer('system-error', {
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}

// ===== ERROR HANDLING =====
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);

    // Versuche die App sauber zu beenden
    if (app) {
        app.quit();
    } else {
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// ===== APP INSTANCE =====
const wareneingangApp = new WareneingangMainApp();

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, focus our window instead
        if (wareneingangApp.mainWindow) {
            if (wareneingangApp.mainWindow.isMinimized()) {
                wareneingangApp.mainWindow.restore();
            }
            wareneingangApp.mainWindow.focus();
        }
    });
}