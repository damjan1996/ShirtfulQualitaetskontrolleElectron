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

// SessionTypes Setup-Funktionen importieren
const { setupSessionTypes } = require('./db/constants/session-types');

// Simple RFID Listener laden (ohne native Dependencies)
let SimpleRFIDListener;
try {
    SimpleRFIDListener = require('./rfid/simple-rfid-listener');
    console.log('✅ Simple RFID Listener geladen');
} catch (error) {
    console.warn('⚠️ Simple RFID Listener nicht verfügbar:', error.message);
    console.log('💡 App läuft ohne RFID-Support');
}

class QualitaetskontrolleMainApp {
    constructor() {
        this.mainWindow = null;
        this.rfidListener = null;
        this.dbClient = null;

        // Status-Tracking
        this.systemStatus = {
            database: false,
            rfid: false,
            sessionTypesSetup: false,
            lastError: null
        };

        // PARALLELE SESSIONS FÜR MEHRERE BENUTZER
        this.activeSessions = new Map(); // userId -> sessionData
        this.activeSessionTimers = new Map(); // sessionId -> timerInterval

        // QUALITÄTSKONTROLLE-SPEZIFISCHE DATENSTRUKTUREN
        this.qrScanStates = new Map(); // qrCode -> { scanCount, firstScanSession, firstScanTime, status }
        this.sessionQrScans = new Map(); // sessionId -> Set(qrCodes)
        this.completedBoxes = new Set(); // Alle abgeschlossenen Kartons (nach 2. Scan)

        // QR-Scan Rate Limiting (pro Session)
        this.qrScanRateLimit = new Map(); // sessionId -> scanTimes[]
        this.maxQRScansPerMinute = 30; // Höher für Qualitätskontrolle

        // Qualitätskontrolle Statistiken
        this.qualityStats = {
            totalBoxesStarted: 0,
            totalBoxesCompleted: 0,
            duplicateAttempts: 0,
            averageProcessingTime: 0,
            activeSessions: 0
        };

        // RFID-Scan Tracking
        this.lastRFIDScanTime = 0;
        this.rfidScanCooldown = 2000; // 2 Sekunden zwischen RFID-Scans

        // Automatische Session-Neustart Konfiguration
        this.autoSessionRestart = true;
        this.sessionRestartDelay = 500; // 500ms Verzögerung zwischen Session-Ende und Neustart

        this.init();
    }

    async init() {
        console.log('🚀 Qualitätskontrolle-App wird initialisiert...');

        // Electron App Events
        app.whenReady().then(() => {
            this.createWindow();
            this.setupEventHandlers();
        });

        app.on('window-all-closed', () => {
            this.cleanup();
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createWindow();
            }
        });

        app.on('before-quit', () => {
            this.cleanup();
        });

        console.log('✅ Qualitätskontrolle-App Initialisierung abgeschlossen');
    }

    async createWindow() {
        console.log('🖥️ Erstelle Hauptfenster mit GPU-Optimierungen...');

        // ===== GPU-OPTIMIERTE ELECTRON-KONFIGURATION =====
        this.mainWindow = new BrowserWindow({
            width: parseInt(process.env.UI_WINDOW_WIDTH) || 1400,
            height: parseInt(process.env.UI_WINDOW_HEIGHT) || 900,
            minWidth: 1200,
            minHeight: 800,

            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js'),

                // ===== QUALITÄTSKONTROLLE GPU-OPTIMIERUNGEN =====
                hardwareAcceleration: true,
                webSecurity: true,
                allowRunningInsecureContent: false,
                experimentalFeatures: true,

                // Optimierte GPU-Flags für Qualitätskontrolle
                additionalArguments: [
                    '--enable-gpu-rasterization',
                    '--enable-features=VaapiVideoDecoder',
                    '--disable-gpu-sandbox',
                    '--enable-accelerated-2d-canvas',
                    '--enable-accelerated-video-decode'
                ],

                enableBlinkFeatures: 'AcceleratedSmallCanvases,Canvas2dImageChromium',
                safeDialogs: true
            },

            show: false,
            title: 'Qualitätskontrolle RFID QR - Shirtful',
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

        // Window erst nach vollständiger Initialisierung anzeigen
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();
            console.log('✅ Hauptfenster erfolgreich geladen (GPU-optimiert)');

            // Development Tools
            if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        // Fenster geschlossen
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });

        // Navigation verhindern
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
                this.createWindow();
            }
        });

        // Nach Window-Erstellung initialisieren
        await this.initializeDatabase();
        await this.initializeRFID();

        console.log('✅ Hauptfenster vollständig initialisiert');
    }

    async setupEventHandlers() {
        console.log('🔗 Richte Event-Handler ein...');

        // ===== SYSTEM-STATUS IPC =====
        ipcMain.handle('system:get-status', () => {
            return {
                database: this.systemStatus.database,
                rfid: this.systemStatus.rfid,
                sessionTypesSetup: this.systemStatus.sessionTypesSetup,
                lastError: this.systemStatus.lastError,
                activeSessions: this.activeSessions.size,
                qualityStats: this.qualityStats
            };
        });

        // ===== SESSIONS IPC (ANGEPASST FÜR QUALITÄTSKONTROLLE) =====
        ipcMain.handle('sessions:get-active', async () => {
            try {
                const sessionList = [];
                for (const [userId, sessionData] of this.activeSessions) {
                    // QR-Scans aus ScannPosition abrufen
                    const pool = this.dbClient.pool;
                    const scansResult = await pool.request()
                        .input('scannKopfId', sessionData.sessionId)
                        .query(`
                            SELECT COUNT(*) as scanCount
                            FROM ScannPosition
                            WHERE ScannKopf_ID = @scannKopfId AND Paketnummer IS NOT NULL
                        `);

                    const qrScanCount = scansResult.recordset[0]?.scanCount || 0;

                    sessionList.push({
                        ...sessionData,
                        qrScanCount: qrScanCount,
                        qrScans: [] // Könnte bei Bedarf die tatsächlichen Paketnummern laden
                    });
                }
                return sessionList;
            } catch (error) {
                console.error('Fehler beim Abrufen aktiver Sessions:', error);
                return Array.from(this.activeSessions.values());
            }
        });

        ipcMain.handle('sessions:end-session', async (event, sessionId) => {
            return await this.endUserSession(sessionId, 'manual');
        });

        // ===== QR-SCAN IPC (QUALITÄTSKONTROLLE-SPEZIFISCH) =====
        ipcMain.handle('qr:process-scan', async (event, qrData, sessionId) => {
            return await this.processQualityControlScan(qrData, sessionId);
        });

        ipcMain.handle('qr:get-scan-state', (event, qrCode) => {
            return this.qrScanStates.get(qrCode) || { scanCount: 0, status: 'not_scanned' };
        });

        ipcMain.handle('qr:get-session-scans', (event, sessionId) => {
            const scans = this.sessionQrScans.get(sessionId) || new Set();
            return Array.from(scans);
        });

        // ===== RFID SIMULATION =====
        ipcMain.handle('rfid:simulate-tag', async (event, tagId) => {
            return await this.handleRFIDScan(tagId);
        });

        // ===== QUALITÄTSKONTROLLE-SPEZIFISCHE STATISTIKEN =====
        ipcMain.handle('quality:get-stats', () => {
            return {
                ...this.qualityStats,
                totalBoxesInProgress: this.qualityStats.totalBoxesStarted - this.qualityStats.totalBoxesCompleted,
                completionRate: this.qualityStats.totalBoxesStarted > 0
                    ? (this.qualityStats.totalBoxesCompleted / this.qualityStats.totalBoxesStarted * 100).toFixed(1)
                    : 0
            };
        });

        ipcMain.handle('quality:reset-stats', () => {
            this.qualityStats = {
                totalBoxesStarted: 0,
                totalBoxesCompleted: 0,
                duplicateAttempts: 0,
                averageProcessingTime: 0,
                activeSessions: this.activeSessions.size
            };
            this.sendToRenderer('quality-stats-updated', this.qualityStats);
            return true;
        });

        console.log('✅ Event-Handler eingerichtet');
    }

    // ===== DATENBANK-INITIALISIERUNG =====
    async initializeDatabase() {
        try {
            console.log('🗄️ Initialisiere Datenbank-Verbindung...');

            this.dbClient = new DatabaseClient();
            const connected = await this.dbClient.connect();

            if (connected) {
                this.systemStatus.database = true;
                console.log('✅ Datenbank verbunden');

                // SessionTypes Setup für Qualitätskontrolle
                const sessionTypesSetup = await this.dbClient.setupSessionTypes();
                this.systemStatus.sessionTypesSetup = sessionTypesSetup;

                if (sessionTypesSetup) {
                    console.log('✅ ScannTyp für Qualitätskontrolle eingerichtet');
                } else {
                    console.warn('⚠️ ScannTyp Setup unvollständig - verwende ID 5.0 für Qualitätskontrolle');
                }

                // Bereits abgeschlossene Kartons laden
                await this.loadCompletedBoxes();

            } else {
                throw new Error('Datenbank-Verbindung fehlgeschlagen');
            }

        } catch (error) {
            this.systemStatus.database = false;
            this.systemStatus.lastError = `Database: ${error.message}`;
            console.error('❌ Datenbank-Initialisierung fehlgeschlagen:', error);
        }
    }

    // ===== RFID-INITIALISIERUNG =====
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
        }
    }

    // ===== QUALITÄTSKONTROLLE-HAUPTLOGIK =====

    async processQualityControlScan(qrData, sessionId) {
        try {
            console.log(`🔍 Qualitätskontrolle QR-Scan: "${qrData}" (Session: ${sessionId})`);

            // Session prüfen
            const sessionData = Array.from(this.activeSessions.values())
                .find(session => session.sessionId === sessionId);

            if (!sessionData) {
                return {
                    success: false,
                    status: 'session_not_found',
                    message: 'Session nicht gefunden',
                    data: null
                };
            }

            // Aktuellen Status des QR-Codes abrufen
            let qrState = this.qrScanStates.get(qrData) || {
                scanCount: 0,
                firstScanSession: null,
                firstScanTime: null,
                status: 'not_scanned'
            };

            // Rate Limiting prüfen
            const rateLimitResult = this.checkQRScanRateLimit(sessionId);
            if (!rateLimitResult.allowed) {
                return {
                    success: false,
                    status: 'rate_limited',
                    message: `Zu viele Scans. Warten Sie ${Math.ceil(rateLimitResult.waitTime / 1000)} Sekunden.`,
                    data: null
                };
            }

            const now = Date.now();

            // QUALITÄTSKONTROLLE-LOGIK: DOPPEL-SCAN-SYSTEM
            if (qrState.scanCount === 0) {
                // ERSTER SCAN: Beginn der Bearbeitung
                qrState = {
                    scanCount: 1,
                    firstScanSession: sessionId,
                    firstScanTime: now,
                    status: 'in_progress'
                };

                this.qrScanStates.set(qrData, qrState);

                // Zu Session-Scans hinzufügen
                if (!this.sessionQrScans.has(sessionId)) {
                    this.sessionQrScans.set(sessionId, new Set());
                }
                this.sessionQrScans.get(sessionId).add(qrData);

                // In Datenbank speichern - ScannPosition verwenden
                const pool = this.dbClient.pool;
                const dbResult = await pool.request()
                    .input('scannKopfId', sessionId)
                    .input('paketnummer', qrData)
                    .query(`
                        INSERT INTO ScannPosition (ScannKopf_ID, Paketnummer, Datum, TagesDatum)
                            OUTPUT INSERTED.ID
                        VALUES (@scannKopfId, @paketnummer, GETDATE(), CAST(GETDATE() AS DATE))
                    `);

                // Statistiken aktualisieren
                this.qualityStats.totalBoxesStarted++;

                console.log(`✅ ERSTER SCAN: Karton ${qrData} - Bearbeitung gestartet`);

                return {
                    success: true,
                    status: 'first_scan',
                    message: 'Karton-Bearbeitung gestartet',
                    data: {
                        scanCount: 1,
                        status: 'in_progress',
                        processing: true,
                        dbResult
                    }
                };

            } else if (qrState.scanCount === 1) {
                // ZWEITER SCAN: Abschluss der Bearbeitung
                if (qrState.firstScanSession !== sessionId) {
                    return {
                        success: false,
                        status: 'wrong_session',
                        message: 'Karton wurde von einem anderen Mitarbeiter gestartet',
                        data: {
                            scanCount: qrState.scanCount,
                            originalSession: qrState.firstScanSession
                        }
                    };
                }

                qrState.scanCount = 2;
                qrState.status = 'completed';
                this.qrScanStates.set(qrData, qrState);

                // Als abgeschlossen markieren
                this.completedBoxes.add(qrData);

                // In Datenbank speichern - ScannPosition verwenden
                const pool = this.dbClient.pool;
                const dbResult = await pool.request()
                    .input('scannKopfId', sessionId)
                    .input('paketnummer', qrData)
                    .query(`
                        INSERT INTO ScannPosition (ScannKopf_ID, Paketnummer, Datum, TagesDatum)
                            OUTPUT INSERTED.ID
                        VALUES (@scannKopfId, @paketnummer, GETDATE(), CAST(GETDATE() AS DATE))
                    `);

                // Bearbeitungszeit berechnen
                const processingTime = now - qrState.firstScanTime;

                // Statistiken aktualisieren
                this.qualityStats.totalBoxesCompleted++;
                this.updateAverageProcessingTime(processingTime);

                console.log(`✅ ZWEITER SCAN: Karton ${qrData} - Bearbeitung abgeschlossen (${this.formatDuration(processingTime)})`);

                // SESSION AUTOMATISCH BEENDEN UND NEUE STARTEN
                await this.endUserSessionAndStartNew(sessionData.userId, sessionId, 'quality_control_complete');

                return {
                    success: true,
                    status: 'second_scan_complete',
                    message: `Karton abgeschlossen! Bearbeitungszeit: ${this.formatDuration(processingTime)}`,
                    data: {
                        scanCount: 2,
                        status: 'completed',
                        processingTime,
                        sessionEnded: true,
                        newSessionStarted: true,
                        dbResult
                    }
                };

            } else {
                // DRITTER ODER WEITERE SCANS: DUPLIKATFEHLER
                this.qualityStats.duplicateAttempts++;

                console.log(`❌ DUPLIKAT-SCAN: Karton ${qrData} bereits abgeschlossen`);

                return {
                    success: false,
                    status: 'duplicate_completed_box',
                    message: 'FEHLER: Karton bereits vollständig abgearbeitet!',
                    data: {
                        scanCount: qrState.scanCount,
                        status: 'completed',
                        firstScanTime: qrState.firstScanTime,
                        originalSession: qrState.firstScanSession
                    }
                };
            }

        } catch (error) {
            console.error('Fehler bei Qualitätskontrolle QR-Scan:', error);
            return {
                success: false,
                status: 'processing_error',
                message: `Verarbeitungsfehler: ${error.message}`,
                data: null
            };
        }
    }

    // ===== SESSION-MANAGEMENT (ANGEPASST FÜR QUALITÄTSKONTROLLE) =====

    async handleRFIDScan(tagId) {
        const now = Date.now();

        // RFID-Cooldown prüfen
        if (now - this.lastRFIDScanTime < this.rfidScanCooldown) {
            console.log(`🔄 RFID-Scan zu schnell: ${now - this.lastRFIDScanTime}ms < ${this.rfidScanCooldown}ms`);
            return { success: false, reason: 'cooldown' };
        }

        this.lastRFIDScanTime = now;

        try {
            console.log(`🏷️ RFID-Tag gescannt: ${tagId}`);

            // Benutzer aus Datenbank abrufen - ScannBenutzer verwenden
            const pool = this.dbClient.pool;
            let userResult = await pool.request()
                .input('epc', parseInt(tagId, 16))
                .query(`
                    SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC,
                           CONCAT(ISNULL(Vorname, ''), ' ', ISNULL(Nachname, '')) as Name
                    FROM ScannBenutzer
                    WHERE EPC = @epc AND xStatus = 0
                `);

            // Fallback: Falls ScannBenutzer leer ist, Testbenutzer erstellen
            if (!userResult.recordset || userResult.recordset.length === 0) {
                console.log(`⚠️ Benutzer mit EPC "${tagId}" nicht gefunden, erstelle Testbenutzer...`);

                // Prüfen ob überhaupt Benutzer in der Tabelle sind
                const userCountResult = await pool.request().query(`SELECT COUNT(*) as count FROM ScannBenutzer WHERE xStatus = 0`);

                if (userCountResult.recordset[0].count === 0) {
                    // Erstelle Testbenutzer
                    await pool.request()
                        .input('epc', parseInt(tagId, 16))
                        .query(`
                            INSERT INTO ScannBenutzer (Vorname, Nachname, BenutzerName, EPC, xStatus)
                            VALUES ('Test', 'Benutzer', 'testuser', @epc, 0)
                        `);

                    // Benutzer erneut laden
                    userResult = await pool.request()
                        .input('epc', parseInt(tagId, 16))
                        .query(`
                            SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC,
                                   CONCAT(ISNULL(Vorname, ''), ' ', ISNULL(Nachname, '')) as Name
                            FROM ScannBenutzer
                            WHERE EPC = @epc AND xStatus = 0
                        `);

                    console.log(`✅ Testbenutzer für EPC "${tagId}" erstellt`);
                }
            }

            if (!userResult.recordset || userResult.recordset.length === 0) {
                console.log(`❌ Benutzer mit EPC "${tagId}" konnte nicht erstellt/gefunden werden`);
                this.sendToRenderer('rfid-scan-error', {
                    tagId,
                    message: 'RFID-Tag nicht registriert',
                    timestamp: new Date().toISOString()
                });
                return { success: false, reason: 'user_not_found' };
            }

            const user = userResult.recordset[0];

            const userId = user.ID;

            // Prüfen ob Benutzer bereits aktive Session hat
            if (this.activeSessions.has(userId)) {
                // Session beenden
                const existingSession = this.activeSessions.get(userId);
                await this.endUserSession(existingSession.sessionId, 'rfid_logout');
                console.log(`🔓 Benutzer ${user.Name} abgemeldet`);
                return { success: true, action: 'logout', user };
            } else {
                // Neue Session starten
                const newSession = await this.startUserSession(userId, user);
                if (newSession) {
                    console.log(`🔐 Benutzer ${user.Name} angemeldet`);
                    return { success: true, action: 'login', user, session: newSession };
                } else {
                    console.log(`❌ Session-Start für ${user.Name} fehlgeschlagen`);
                    return { success: false, reason: 'session_start_failed' };
                }
            }

        } catch (error) {
            console.error('RFID-Scan Fehler:', error);
            this.sendToRenderer('rfid-scan-error', {
                tagId,
                message: `Fehler: ${error.message}`,
                timestamp: new Date().toISOString()
            });
            return { success: false, reason: 'error', error: error.message };
        }
    }

    async startUserSession(userId, user) {
        try {
            console.log(`🟢 Starte neue Qualitätskontrolle-Session für ${user.Name}...`);

            // Session in Datenbank erstellen - ScannKopf verwenden
            const pool = this.dbClient.pool;
            const sessionResult = await pool.request()
                .input('epc', parseInt(user.EPC, 10))
                .input('scannTypId', 5.0) // Qualitätskontrolle ID aus ScannTyp
                .query(`
                    INSERT INTO ScannKopf (EPC, ScannTyp_ID, Datum, TagesDatum)
                        OUTPUT INSERTED.ID
                    VALUES (@epc, @scannTypId, GETDATE(), CAST(GETDATE() AS DATE))
                `);

            if (!sessionResult.recordset || sessionResult.recordset.length === 0) {
                throw new Error('Session konnte nicht in der Datenbank erstellt werden');
            }

            const sessionId = sessionResult.recordset[0].ID;
            const startTime = Date.now();

            // Session-Daten
            const sessionData = {
                sessionId,
                userId,
                userName: user.Name,
                userEPC: user.EPC,
                startTime,
                qrScanCount: 0,
                sessionType: 'Qualitaetskontrolle'
            };

            // Session registrieren
            this.activeSessions.set(userId, sessionData);
            this.sessionQrScans.set(sessionId, new Set());

            // Session-Timer starten
            this.startSessionTimer(sessionId, userId);

            // Statistiken aktualisieren
            this.qualityStats.activeSessions = this.activeSessions.size;

            // UI benachrichtigen
            this.sendToRenderer('session-started', sessionData);
            this.sendToRenderer('sessions-updated', Array.from(this.activeSessions.values()));
            this.sendToRenderer('rfid-scan-success', {
                action: 'login',
                user: user,
                session: sessionData,
                timestamp: new Date().toISOString()
            });

            console.log(`✅ Session ${sessionId} für ${user.Name} erfolgreich gestartet`);
            return sessionData;

        } catch (error) {
            console.error('Fehler beim Starten der Session:', error);
            return null;
        }
    }

    async endUserSessionAndStartNew(userId, sessionId, reason = 'auto_restart') {
        try {
            console.log(`🔄 Beende Session ${sessionId} und starte neue Session für User ${userId}...`);

            // Session beenden
            await this.endUserSession(sessionId, reason);

            // Kurze Verzögerung vor Neustart
            await new Promise(resolve => setTimeout(resolve, this.sessionRestartDelay));

            // Benutzer-Daten abrufen
            const userSessions = Array.from(this.activeSessions.entries());
            const userSession = userSessions.find(([uid, session]) => session.sessionId === sessionId);

            if (!userSession) {
                // Benutzer aus Datenbank abrufen - ScannBenutzer verwenden
                const pool = this.dbClient.pool;
                const userResult = await pool.request()
                    .input('userId', userId)
                    .query(`
                        SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC,
                               CONCAT(ISNULL(Vorname, ''), ' ', ISNULL(Nachname, '')) as Name
                        FROM ScannBenutzer
                        WHERE ID = @userId AND xStatus = 0
                    `);

                if (userResult.recordset && userResult.recordset.length > 0) {
                    const user = userResult.recordset[0];
                    await this.startUserSession(userId, user);
                }
            }

            console.log(`✅ Session-Neustart für User ${userId} abgeschlossen`);

        } catch (error) {
            console.error('Fehler beim Session-Neustart:', error);
        }
    }

    async endUserSession(sessionId, reason = 'manual') {
        try {
            console.log(`🔴 Beende Session ${sessionId} (Grund: ${reason})...`);

            // Session-Daten finden
            let sessionData = null;
            let userId = null;

            for (const [uid, session] of this.activeSessions) {
                if (session.sessionId === sessionId) {
                    sessionData = session;
                    userId = uid;
                    break;
                }
            }

            if (!sessionData) {
                console.warn(`Session ${sessionId} nicht in aktiven Sessions gefunden`);
                return false;
            }

            // Session in Datenbank beenden - ScannKopf aktualisieren (falls gewünscht)
            // Hinweis: Im ScannKopf-Schema gibt es keine explizite "Beendet"-Markierung
            // Optional: Könnte xStatus oder ein anderes Feld verwenden
            const pool = this.dbClient.pool;
            const endResult = await pool.request()
                .input('scannKopfId', sessionId)
                .query(`
                    UPDATE ScannKopf
                    SET xDatum = GETDATE()
                    WHERE ID = @scannKopfId
                `);

            // Session-Timer stoppen
            this.stopSessionTimer(sessionId);

            // Session aus aktiven Sessions entfernen
            this.activeSessions.delete(userId);
            this.sessionQrScans.delete(sessionId);

            // Rate Limiting zurücksetzen
            this.qrScanRateLimit.delete(sessionId);

            // Statistiken aktualisieren
            this.qualityStats.activeSessions = this.activeSessions.size;

            // UI benachrichtigen
            this.sendToRenderer('session-ended', {
                sessionId,
                userId,
                userName: sessionData.userName,
                reason,
                duration: Date.now() - sessionData.startTime
            });
            this.sendToRenderer('sessions-updated', Array.from(this.activeSessions.values()));

            console.log(`✅ Session ${sessionId} erfolgreich beendet`);
            return true;

        } catch (error) {
            console.error('Fehler beim Beenden der Session:', error);
            return false;
        }
    }

    // ===== HILFSFUNKTIONEN =====

    startSessionTimer(sessionId, userId) {
        if (this.activeSessionTimers.has(sessionId)) {
            clearInterval(this.activeSessionTimers.get(sessionId));
        }

        const timer = setInterval(() => {
            const sessionData = this.activeSessions.get(userId);
            if (sessionData) {
                const duration = Date.now() - sessionData.startTime;
                this.sendToRenderer('session-timer-update', {
                    sessionId,
                    userId,
                    duration,
                    formattedDuration: this.formatDuration(duration)
                });
            }
        }, 1000);

        this.activeSessionTimers.set(sessionId, timer);
    }

    stopSessionTimer(sessionId) {
        if (this.activeSessionTimers.has(sessionId)) {
            clearInterval(this.activeSessionTimers.get(sessionId));
            this.activeSessionTimers.delete(sessionId);
        }
    }

    checkQRScanRateLimit(sessionId) {
        const now = Date.now();
        const scanTimes = this.qrScanRateLimit.get(sessionId) || [];

        // Alte Einträge entfernen (älter als 1 Minute)
        const recentScans = scanTimes.filter(time => now - time < 60000);

        if (recentScans.length >= this.maxQRScansPerMinute) {
            const oldestScan = Math.min(...recentScans);
            const waitTime = 60000 - (now - oldestScan);
            return { allowed: false, waitTime };
        }

        // Scan hinzufügen
        recentScans.push(now);
        this.qrScanRateLimit.set(sessionId, recentScans);

        return { allowed: true, waitTime: 0 };
    }

    updateAverageProcessingTime(newTime) {
        const count = this.qualityStats.totalBoxesCompleted;
        if (count === 1) {
            this.qualityStats.averageProcessingTime = newTime;
        } else {
            const currentAvg = this.qualityStats.averageProcessingTime;
            this.qualityStats.averageProcessingTime =
                ((currentAvg * (count - 1)) + newTime) / count;
        }
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    async loadCompletedBoxes() {
        try {
            // Lade bereits abgeschlossene Kartons (Paketnummern mit 2 Scans) aus ScannPosition
            const pool = this.dbClient.pool;
            const result = await pool.request().query(`
                SELECT Paketnummer, COUNT(*) as ScanCount
                FROM ScannPosition sp
                         INNER JOIN ScannKopf sk ON sp.ScannKopf_ID = sk.ID
                WHERE sk.ScannTyp_ID = 5.0
                  AND sp.Datum >= DATEADD(day, -7, GETDATE())
                  AND sp.Paketnummer IS NOT NULL
                GROUP BY Paketnummer
                HAVING COUNT(*) >= 2
            `);

            if (result.recordset) {
                result.recordset.forEach(row => {
                    this.completedBoxes.add(row.Paketnummer);
                    this.qrScanStates.set(row.Paketnummer, {
                        scanCount: row.ScanCount,
                        status: 'completed'
                    });
                });
            }

            console.log(`✅ ${this.completedBoxes.size} abgeschlossene Kartons geladen`);

        } catch (error) {
            console.error('Fehler beim Laden abgeschlossener Kartons:', error);
        }
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    async cleanup() {
        console.log('🧹 Qualitätskontrolle-App wird beendet...');

        // RFID-Listener stoppen
        if (this.rfidListener) {
            await this.rfidListener.stop();
        }

        // Session-Timer stoppen
        for (const timer of this.activeSessionTimers.values()) {
            clearInterval(timer);
        }

        // Datenbank-Verbindung schließen
        if (this.dbClient) {
            await this.dbClient.disconnect();
        }

        console.log('✅ Cleanup abgeschlossen');
    }
}

// App starten
new QualitaetskontrolleMainApp();