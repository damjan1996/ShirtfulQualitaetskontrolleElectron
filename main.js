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

        // QR-Code Dekodierung Statistiken
        this.decodingStats = {
            totalScans: 0,
            successfulDecodes: 0,
            withAuftrag: 0,
            withPaket: 0,
            withKunde: 0
        };

        // RFID-Session-Wechsel Tracking
        this.lastRFIDScanTime = 0;
        this.rfidScanCooldown = 2000; // 2 Sekunden zwischen RFID-Scans

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

            // QR-Code Dekodierung Statistiken laden
            await this.loadDecodingStats();

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

    async loadDecodingStats() {
        try {
            if (!this.dbClient || !this.systemStatus.database) return;

            const stats = await this.dbClient.getQRScanStats();
            if (stats) {
                this.decodingStats = {
                    totalScans: stats.TotalScans || 0,
                    successfulDecodes: stats.DecodedScans || 0,
                    withAuftrag: stats.ScansWithAuftrag || 0,
                    withPaket: stats.ScansWithPaket || 0,
                    withKunde: stats.ScansWithKunde || 0,
                    decodingSuccessRate: stats.DecodingSuccessRate || 0
                };

                console.log('📋 QR-Code Dekodierung Statistiken geladen:', this.decodingStats);
            }
        } catch (error) {
            console.error('Fehler beim Laden der Dekodierung-Statistiken:', error);
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

        ipcMain.handle('db-get-user-by-id', async (event, userId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return null;
                }
                return await this.dbClient.getUserById(userId);
            } catch (error) {
                console.error('Get User by ID Fehler:', error);
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

                // Session-Informationen vor dem Beenden abrufen
                let currentSessionUser = null;
                if (this.currentSession && this.currentSession.sessionId === sessionId) {
                    // User-Daten für das Logout-Event abrufen
                    try {
                        const user = await this.dbClient.getUserById(this.currentSession.userId);
                        currentSessionUser = user;
                    } catch (error) {
                        console.warn('Benutzer für Logout-Event nicht gefunden:', error);
                    }
                }

                const success = await this.dbClient.endSession(sessionId);

                if (success) {
                    // Session zurücksetzen
                    if (this.currentSession && this.currentSession.sessionId === sessionId) {
                        const oldSession = this.currentSession;
                        this.currentSession = null;

                        // Rate Limit für Session zurücksetzen
                        this.qrScanRateLimit.delete(oldSession.sessionId);

                        // **WICHTIG: user-logout Event senden, genau wie beim RFID-Logout**
                        if (currentSessionUser) {
                            this.sendToRenderer('user-logout', {
                                user: currentSessionUser,
                                sessionId: oldSession.sessionId,
                                timestamp: new Date().toISOString(),
                                reason: 'manual_logout'
                            });

                            console.log(`👋 Benutzer abgemeldet (Button): ${currentSessionUser.BenutzerName}`);
                        }
                    }
                }

                return success;
            } catch (error) {
                console.error('Session End Fehler:', error);
                return false;
            }
        });

        // ===== QR-CODE OPERATIONEN MIT STRUKTURIERTEN ANTWORTEN UND DEKODIERUNG =====
        ipcMain.handle('qr-scan-save', async (event, sessionId, payload) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return {
                        success: false,
                        status: 'database_offline',
                        message: 'Datenbank nicht verbunden',
                        data: null,
                        timestamp: new Date().toISOString()
                    };
                }

                // Rate Limiting prüfen
                if (!this.checkQRScanRateLimit(sessionId)) {
                    return {
                        success: false,
                        status: 'rate_limit',
                        message: 'Zu viele QR-Scans pro Minute - bitte warten Sie',
                        data: null,
                        timestamp: new Date().toISOString()
                    };
                }

                // Payload bereinigen (BOM entfernen falls vorhanden)
                const cleanPayload = payload.replace(/^\ufeff/, '');

                // QR-Scan speichern - gibt jetzt immer strukturierte Antwort mit Dekodierung zurück
                const result = await this.dbClient.saveQRScan(sessionId, cleanPayload);

                // Rate Limit Counter aktualisieren bei erfolgreichen Scans
                if (result.success) {
                    this.updateQRScanRateLimit(sessionId);

                    // Dekodierung-Statistiken aktualisieren
                    await this.updateDecodingStats(result);
                }

                console.log(`QR-Scan Ergebnis für Session ${sessionId}:`, {
                    success: result.success,
                    status: result.status,
                    message: result.message,
                    hasDecodedData: !!(result.data?.DecodedData)
                });

                return result;

            } catch (error) {
                console.error('QR Scan Save unerwarteter Fehler:', error);
                return {
                    success: false,
                    status: 'error',
                    message: `Unerwarteter Fehler: ${error.message}`,
                    data: null,
                    timestamp: new Date().toISOString()
                };
            }
        });

        // ===== QR-CODE DEKODIERUNG OPERATIONEN =====
        ipcMain.handle('qr-get-decoded-scans', async (event, sessionId, limit = 50) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return [];
                }

                const scans = await this.dbClient.getQRScansBySession(sessionId, limit);

                // Nur Scans mit dekodierten Daten zurückgeben
                return scans.filter(scan => scan.DecodedData && Object.keys(scan.DecodedData).length > 0);
            } catch (error) {
                console.error('Fehler beim Abrufen dekodierter QR-Scans:', error);
                return [];
            }
        });

        ipcMain.handle('qr-search-decoded', async (event, searchTerm, sessionId = null) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return [];
                }

                return await this.dbClient.searchQRScans(searchTerm, sessionId, 20);
            } catch (error) {
                console.error('Fehler bei dekodierter QR-Code-Suche:', error);
                return [];
            }
        });

        ipcMain.handle('qr-get-decoding-stats', async (event, sessionId = null) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return this.decodingStats;
                }

                const stats = await this.dbClient.getQRScanStats(sessionId);
                return {
                    ...this.decodingStats,
                    ...stats,
                    lastUpdated: new Date().toISOString()
                };
            } catch (error) {
                console.error('Fehler beim Abrufen der Dekodierung-Statistiken:', error);
                return this.decodingStats;
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
                qrScanStats: this.getQRScanStats(),
                decodingStats: this.decodingStats
            };
        });

        ipcMain.handle('get-system-info', async (event) => {
            return {
                version: app.getVersion() || '1.0.0',
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                platform: process.platform,
                arch: process.arch,
                env: process.env.NODE_ENV || 'production',
                features: {
                    qrDecoding: true,
                    decodingFormats: ['caret_separated', 'pattern_matching', 'structured_data'],
                    supportedFields: ['auftrags_nr', 'paket_nr', 'kunden_name']
                }
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

    // ===== QR-CODE DEKODIERUNG STATISTIKEN =====
    async updateDecodingStats(scanResult) {
        try {
            if (!scanResult.success || !scanResult.data) return;

            this.decodingStats.totalScans++;

            const decodedData = scanResult.data.DecodedData;
            if (decodedData) {
                this.decodingStats.successfulDecodes++;

                if (decodedData.auftrags_nr && decodedData.auftrags_nr.trim()) {
                    this.decodingStats.withAuftrag++;
                }

                if (decodedData.paket_nr && decodedData.paket_nr.trim()) {
                    this.decodingStats.withPaket++;
                }

                if (decodedData.kunden_name && decodedData.kunden_name.trim()) {
                    this.decodingStats.withKunde++;
                }

                // Success Rate berechnen
                this.decodingStats.decodingSuccessRate = Math.round(
                    (this.decodingStats.successfulDecodes / this.decodingStats.totalScans) * 100
                );

                console.log(`📊 Dekodierung-Statistiken aktualisiert:`, {
                    total: this.decodingStats.totalScans,
                    decoded: this.decodingStats.successfulDecodes,
                    rate: this.decodingStats.decodingSuccessRate + '%',
                    auftrag: this.decodingStats.withAuftrag,
                    paket: this.decodingStats.withPaket,
                    kunde: this.decodingStats.withKunde
                });

                // Statistiken an Renderer senden
                this.sendToRenderer('decoding-stats-updated', {
                    stats: this.decodingStats,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            console.error('Fehler beim Aktualisieren der Dekodierung-Statistiken:', error);
        }
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

    // ===== VERBESSERTER RFID HANDLING MIT ZUVERLÄSSIGEM SESSION-RESET =====
    async handleRFIDScan(tagId) {
        const now = Date.now();

        // Cooldown für RFID-Scans prüfen (verhindert Doppel-Scans)
        if (now - this.lastRFIDScanTime < this.rfidScanCooldown) {
            console.log(`🔄 RFID-Scan zu schnell, ignoriert: ${tagId} (${now - this.lastRFIDScanTime}ms < ${this.rfidScanCooldown}ms)`);
            return;
        }
        this.lastRFIDScanTime = now;

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

            console.log(`👤 Benutzer gefunden: ${user.BenutzerName} (ID: ${user.ID})`);

            // ===== SCHRITT 1: VOLLSTÄNDIGER SESSION-RESET IM FRONTEND AUSLÖSEN =====
            console.log('🔄 Triggere vollständigen Session-Reset im Frontend...');
            this.sendToRenderer('session-reset-before-login', {
                newUser: user,
                timestamp: new Date().toISOString(),
                reason: 'rfid_user_switch'
            });

            // Kurze Verzögerung für Frontend-Reset
            await new Promise(resolve => setTimeout(resolve, 100));

            // ===== SCHRITT 2: ALLE AKTIVEN SESSIONS IN DATENBANK BEENDEN =====
            console.log(`🔚 Beende alle aktiven Sessions vor Anmeldung von ${user.BenutzerName}...`);

            const endResult = await this.dbClient.endAllActiveSessions();

            if (!endResult.success) {
                console.error('Fehler beim Beenden der aktiven Sessions:', endResult.error);
                this.sendToRenderer('rfid-scan-error', {
                    tagId,
                    message: 'Fehler beim Beenden aktiver Sessions',
                    timestamp: new Date().toISOString()
                });
                return;
            }

            // ===== SCHRITT 3: LOGOUT-EVENTS FÜR ALLE BEENDETEN SESSIONS SENDEN =====
            if (endResult.endedUsers.length > 0) {
                console.log(`👋 ${endResult.endedUsers.length} aktive Session(s) beendet:`);

                for (const endedUser of endResult.endedUsers) {
                    console.log(`   - ${endedUser.userName} (Session ${endedUser.sessionId})`);

                    // Logout-Event für jeden beendeten Benutzer senden
                    this.sendToRenderer('user-logout', {
                        user: {
                            ID: endedUser.userId,
                            BenutzerName: endedUser.userName
                        },
                        sessionId: endedUser.sessionId,
                        timestamp: new Date().toISOString(),
                        reason: 'automatic_logout_rfid_switch'
                    });
                }

                // Lokale Session-Daten zurücksetzen
                this.currentSession = null;

                // Rate Limits für alle beendeten Sessions zurücksetzen
                for (const endedUser of endResult.endedUsers) {
                    this.qrScanRateLimit.delete(endedUser.sessionId);
                }

                // Weitere Verzögerung für vollständigen Frontend-Reset
                await new Promise(resolve => setTimeout(resolve, 200));
            } else {
                console.log('📝 Keine aktiven Sessions gefunden');
            }

            // ===== SCHRITT 4: NEUE SESSION FÜR DEN GESCANNTEN BENUTZER STARTEN =====
            console.log(`🔑 Starte neue Session für ${user.BenutzerName}...`);

            const session = await this.dbClient.createSession(user.ID);

            if (session) {
                // Lokale Session-Daten setzen
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

                // ===== SCHRITT 5: LOGIN-EVENT SENDEN =====
                this.sendToRenderer('user-login', {
                    user,
                    session: normalizedSession,
                    timestamp: new Date().toISOString(),
                    previousLogouts: endResult.endedUsers.length,
                    source: 'rfid_scan',
                    fullReset: true // ← Kennzeichnet dass vollständiger Reset erfolgt ist
                });

                console.log(`✅ RFID-Benutzerwechsel erfolgreich abgeschlossen:`);
                console.log(`   Neuer Benutzer: ${user.BenutzerName} (Session ${session.ID})`);
                if (endResult.endedUsers.length > 0) {
                    console.log(`   ${endResult.endedUsers.length} vorherige Session(s) automatisch beendet`);
                }
                console.log(`   Vollständiger Session-Reset durchgeführt`);
            } else {
                this.sendToRenderer('rfid-scan-error', {
                    tagId,
                    message: 'Fehler beim Erstellen der neuen Session',
                    timestamp: new Date().toISOString()
                });
            }

        } catch (error) {
            console.error('RFID-Verarbeitungs-Fehler:', error);
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
            timestamp: new Date().toISOString(),
            decodingStats: this.decodingStats
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

            // Dekodierung-Statistiken zurücksetzen
            this.decodingStats = {
                totalScans: 0,
                successfulDecodes: 0,
                withAuftrag: 0,
                withPaket: 0,
                withKunde: 0
            };

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