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

        // QUALITÄTSKONTROLLE: Sessions für zweimaliges Scannen
        this.activeSessions = new Map(); // userId -> sessionData
        this.activeSessionTimers = new Map(); // sessionId -> timerInterval

        // NEUE STRUKTUR: QR-Code Status-Tracking für Qualitätskontrolle
        this.qrCodeStates = new Map(); // qrCode -> { status: 'first_scan' | 'complete', sessionId, firstScanTime }
        this.completedQRCodes = new Set(); // QR-Codes die bereits beide Scans haben

        // QR-Scan Rate Limiting (pro Session)
        this.qrScanRateLimit = new Map(); // sessionId -> scanTimes[]
        this.maxQRScansPerMinute = 20;

        // QR-Code Dekodierung Statistiken (global)
        this.decodingStats = {
            totalScans: 0,
            successfulDecodes: 0,
            withAuftrag: 0,
            withPaket: 0,
            withKunde: 0
        };

        // RFID-Scan Tracking
        this.lastRFIDScanTime = 0;
        this.rfidScanCooldown = 2000; // 2 Sekunden zwischen RFID-Scans

        // Session-Type Priorität für Qualitätskontrolle
        this.sessionTypePriority = ['Qualitätskontrolle', 'QUALITAETSKONTROLLE'];

        // Setup completion tracking
        this.setupCompleted = false;
    }

    // ===== INITIALIZATION =====
    async initialize() {
        console.log('🚀 Starte Qualitätskontrolle-Anwendung...');

        // App-Event-Listener
        app.whenReady().then(() => {
            this.createMainWindow();
            this.initializeComponents();
        });

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                this.cleanup().then(() => {
                    app.quit();
                });
            }
        });

        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) {
                this.createMainWindow();
            }
        });

        app.on('before-quit', async (event) => {
            if (!this.cleanupStarted) {
                event.preventDefault();
                this.cleanupStarted = true;
                await this.cleanup();
                app.quit();
            }
        });

        // IPC-Handlers registrieren
        this.registerIPCHandlers();
    }

    createMainWindow() {
        // Bestehende Fenster schließen
        if (this.mainWindow) {
            this.mainWindow.close();
            this.mainWindow = null;
        }

        const isDev = process.env.NODE_ENV === 'development';
        const windowWidth = parseInt(process.env.UI_WINDOW_WIDTH) || 1400;
        const windowHeight = parseInt(process.env.UI_WINDOW_HEIGHT) || 900;

        this.mainWindow = new BrowserWindow({
            width: windowWidth,
            height: windowHeight,
            minWidth: 1200,
            minHeight: 800,
            show: false,
            icon: path.join(__dirname, 'assets', 'icon.png'),
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                enableRemoteModule: false,
                preload: path.join(__dirname, 'preload.js'),
                webSecurity: true, // Sicherheit aktiviert
                allowRunningInsecureContent: false,
                experimentalFeatures: false
            },
            title: 'Qualitätskontrolle RFID QR - Shirtful'
        });

        // HTML-Datei laden
        this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

        // Fenster anzeigen wenn bereit
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();

            if (isDev) {
                this.mainWindow.webContents.openDevTools();
            }

            console.log('✅ Hauptfenster erfolgreich geladen');
        });

        // Fehlerbehandlung
        this.mainWindow.on('unresponsive', () => {
            console.warn('⚠️ Hauptfenster antwortet nicht');
            dialog.showErrorBox(
                'Anwendung antwortet nicht',
                'Die Anwendung ist nicht mehr reaktionsfähig. Sie wird neu gestartet.'
            );

            // Neustart nach kurzer Verzögerung
            setTimeout(() => {
                this.createMainWindow();
            }, 1000);
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

            this.systemStatus.database = true;
            this.systemStatus.lastError = null;

            console.log('✅ Datenbank erfolgreich verbunden');

            // **KRITISCH: SessionTypes Setup ausführen**
            await this.setupSessionTypes();

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

    async setupSessionTypes() {
        try {
            console.log('🔧 Initialisiere SessionTypes...');

            // SessionTypes Setup mit roher Datenbankverbindung ausführen
            const success = await setupSessionTypes(this.dbClient);

            if (success) {
                this.systemStatus.sessionTypesSetup = true;
                console.log('✅ SessionTypes erfolgreich initialisiert');

                // Verfügbare SessionTypes anzeigen
                const sessionTypes = await this.dbClient.getSessionTypes();
                console.log(`📋 Verfügbare SessionTypes (${sessionTypes.length}):`);
                sessionTypes.forEach(type => {
                    console.log(`   - ${type.TypeName}: ${type.Description}`);
                });

                // SessionType-Priorität basierend auf verfügbaren Types aktualisieren
                this.updateSessionTypePriority(sessionTypes);

            } else {
                this.systemStatus.sessionTypesSetup = false;
                this.systemStatus.lastError = 'SessionTypes Setup fehlgeschlagen';
                console.error('❌ SessionTypes Setup fehlgeschlagen');

                // Weiter ausführen, aber mit Warnung
                console.warn('⚠️ App läuft ohne vollständiges SessionTypes-Setup');
            }

        } catch (error) {
            this.systemStatus.sessionTypesSetup = false;
            this.systemStatus.lastError = `SessionTypes: ${error.message}`;
            console.error('❌ SessionTypes Setup Fehler:', error);
        }
    }

    updateSessionTypePriority(sessionTypes) {
        if (!sessionTypes || sessionTypes.length === 0) return;

        // Verfügbare SessionType-Namen sammeln
        const availableTypes = sessionTypes.map(type => type.TypeName);

        // Priorität basierend auf verfügbaren Types setzen
        this.sessionTypePriority = availableTypes.filter(type =>
            type.includes('Qualitätskontrolle') || type.includes('QUALITAETSKONTROLLE')
        );

        // Fallback falls kein spezifischer Type gefunden
        if (this.sessionTypePriority.length === 0) {
            this.sessionTypePriority = availableTypes.slice(0, 1); // Ersten verfügbaren Type nehmen
        }

        console.log('📋 SessionType-Priorität aktualisiert:', this.sessionTypePriority);
    }

    async initializeRFID() {
        try {
            if (SimpleRFIDListener) {
                console.log('🏷️ Initialisiere RFID-Listener...');

                this.rfidListener = new SimpleRFIDListener({
                    debug: process.env.NODE_ENV === 'development',
                    minScanInterval: parseInt(process.env.RFID_MIN_SCAN_INTERVAL) || 1000,
                    inputTimeout: parseInt(process.env.RFID_INPUT_TIMEOUT) || 500,
                    maxBufferLength: parseInt(process.env.RFID_MAX_BUFFER_LENGTH) || 20
                });

                // RFID-Event-Handler
                this.rfidListener.on('tag-scanned', this.handleRFIDScan.bind(this));
                this.rfidListener.on('error', (error) => {
                    console.error('RFID-Fehler:', error);
                    this.systemStatus.rfid = false;
                });

                await this.rfidListener.start();

                this.systemStatus.rfid = true;
                console.log('✅ RFID-Listener erfolgreich gestartet');

            } else {
                console.warn('⚠️ RFID-Listener nicht verfügbar - App läuft ohne RFID-Support');
                this.systemStatus.rfid = false;
            }

        } catch (error) {
            console.error('❌ RFID-Initialisierung fehlgeschlagen:', error);
            this.systemStatus.rfid = false;
            this.systemStatus.lastError = `RFID: ${error.message}`;
        }
    }

    async loadDecodingStats() {
        try {
            // Prüfen ob dbClient und die Methode verfügbar sind
            if (!this.dbClient || typeof this.dbClient.getDecodingStats !== 'function') {
                console.warn('⚠️ DatabaseClient oder getDecodingStats-Methode nicht verfügbar');
                return;
            }

            // QR-Code Dekodierung Statistiken aus Datenbank laden
            const stats = await this.dbClient.getDecodingStats();

            if (stats) {
                this.decodingStats = {
                    totalScans: stats.totalScans || 0,
                    successfulDecodes: stats.successfulDecodes || 0,
                    withAuftrag: stats.withAuftrag || 0,
                    withPaket: stats.withPaket || 0,
                    withKunde: stats.withKunde || 0
                };

                console.log('📊 Dekodierung-Statistiken geladen:', this.decodingStats);
            }

        } catch (error) {
            console.warn('⚠️ Dekodierung-Statistiken laden fehlgeschlagen:', error.message);
            // Nicht kritisch - weiter mit Standard-Statistiken
        }
    }

    // ===== IPC HANDLERS =====
    registerIPCHandlers() {
        // System-Status
        ipcMain.handle('system:get-status', () => {
            return {
                database: this.systemStatus.database,
                rfid: this.systemStatus.rfid,
                sessionTypesSetup: this.systemStatus.sessionTypesSetup,
                lastError: this.systemStatus.lastError,
                timestamp: new Date().toISOString(),
                activeSessionCount: this.activeSessions.size,
                completedQRCodes: this.completedQRCodes.size
            };
        });

        // Session-Management
        ipcMain.handle('session:get-all-active', () => {
            const sessions = [];
            for (const [userId, sessionData] of this.activeSessions.entries()) {
                sessions.push({
                    userId: userId,
                    sessionId: sessionData.sessionId,
                    userName: sessionData.userName,
                    startTime: sessionData.startTime,
                    duration: Date.now() - sessionData.startTime,
                    firstScans: sessionData.firstScans || 0,
                    completedScans: sessionData.completedScans || 0,
                    totalScans: (sessionData.firstScans || 0) + (sessionData.completedScans || 0)
                });
            }
            return sessions;
        });

        ipcMain.handle('session:end', async (event, sessionId) => {
            try {
                return await this.endSession(sessionId);
            } catch (error) {
                console.error('Session beenden fehlgeschlagen:', error);
                return { success: false, error: error.message };
            }
        });

        // RFID-Simulation für Tests
        ipcMain.handle('rfid:simulate-tag', async (event, tagId) => {
            console.log(`🧪 RFID-Simulation: ${tagId}`);
            return await this.handleRFIDScan(tagId);
        });

        // QR-Code Handling
        ipcMain.handle('qr:scan', async (event, qrData, sessionId) => {
            try {
                return await this.handleQRScan(qrData, sessionId);
            } catch (error) {
                console.error('QR-Scan Fehler:', error);
                return {
                    success: false,
                    error: error.message,
                    qrData: qrData
                };
            }
        });

        // QR-Code Status abrufen
        ipcMain.handle('qr:get-status', (event, qrCode) => {
            const state = this.qrCodeStates.get(qrCode);
            if (!state) {
                return { status: 'not_found' };
            }
            return {
                status: state.status,
                sessionId: state.sessionId,
                firstScanTime: state.firstScanTime,
                isCompleted: this.completedQRCodes.has(qrCode)
            };
        });

        // Session-Statistiken
        ipcMain.handle('stats:get-session', (event, sessionId) => {
            return this.getSessionStats(sessionId);
        });

        // Globale Statistiken
        ipcMain.handle('stats:get-global', () => {
            return {
                decodingStats: this.decodingStats,
                activeSessionCount: this.activeSessions.size,
                completedQRCodes: this.completedQRCodes.size,
                totalQRStates: this.qrCodeStates.size
            };
        });

        // Debugging
        ipcMain.handle('debug:get-session-info', () => {
            const sessionInfo = {};
            for (const [userId, sessionData] of this.activeSessions.entries()) {
                sessionInfo[userId] = {
                    sessionId: sessionData.sessionId,
                    userName: sessionData.userName,
                    startTime: sessionData.startTime,
                    firstScans: sessionData.firstScans || 0,
                    completedScans: sessionData.completedScans || 0
                };
            }
            return {
                activeSessions: sessionInfo,
                qrCodeStates: Object.fromEntries(this.qrCodeStates),
                completedQRCodes: Array.from(this.completedQRCodes)
            };
        });
    }

    // ===== RFID HANDLING =====
    async handleRFIDScan(tagId) {
        try {
            // Rate-Limiting für RFID-Scans
            const now = Date.now();
            if (now - this.lastRFIDScanTime < this.rfidScanCooldown) {
                return {
                    success: false,
                    error: 'RFID-Scan zu schnell - bitte warten',
                    cooldownRemaining: this.rfidScanCooldown - (now - this.lastRFIDScanTime)
                };
            }
            this.lastRFIDScanTime = now;

            console.log(`🏷️ RFID-Tag gescannt: ${tagId}`);

            // Benutzer in Datenbank suchen
            const user = await this.dbClient.getUserByEPC(tagId);
            if (!user) {
                console.warn(`⚠️ Unbekannter RFID-Tag: ${tagId}`);
                return {
                    success: false,
                    error: 'Unbekannter RFID-Tag',
                    tagId: tagId
                };
            }

            // Prüfen ob Benutzer bereits aktive Session hat
            const existingSession = this.activeSessions.get(user.ID);

            if (existingSession) {
                // Bestehende Session beenden
                console.log(`🔚 Beende Session für Benutzer ${user.Name} (ID: ${user.ID})`);

                const result = await this.endSession(existingSession.sessionId);
                if (result.success) {
                    // Neue Session starten
                    return await this.startSession(user);
                } else {
                    return {
                        success: false,
                        error: 'Fehler beim Beenden der vorherigen Session'
                    };
                }
            } else {
                // Neue Session starten
                return await this.startSession(user);
            }

        } catch (error) {
            console.error('❌ RFID-Handling Fehler:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // ===== SESSION MANAGEMENT =====
    async startSession(user) {
        try {
            console.log(`🎬 Starte Session für Benutzer: ${user.Name} (ID: ${user.ID})`);

            // SessionType bestimmen (priorität: Qualitätskontrolle)
            const sessionTypes = await this.dbClient.getSessionTypes();
            let sessionType = null;

            // Qualitätskontrolle-SessionType finden
            for (const priorityType of this.sessionTypePriority) {
                sessionType = sessionTypes.find(type => type.TypeName === priorityType);
                if (sessionType) break;
            }

            if (!sessionType) {
                console.warn('⚠️ Kein passender SessionType gefunden, verwende ersten verfügbaren');
                sessionType = sessionTypes[0];
            }

            if (!sessionType) {
                throw new Error('Keine SessionTypes verfügbar');
            }

            console.log(`📋 Verwende SessionType: ${sessionType.TypeName}`);

            // Session in Datenbank erstellen
            const sessionId = await this.dbClient.startSession(user.ID, sessionType.ID);

            // Session lokal registrieren
            const sessionData = {
                sessionId: sessionId,
                userId: user.ID,
                userName: user.Name,
                startTime: Date.now(),
                sessionType: sessionType.TypeName,
                firstScans: 0,
                completedScans: 0
            };

            this.activeSessions.set(user.ID, sessionData);

            // Session-Timer starten
            this.startSessionTimer(sessionId);

            // QR-Scan Rate-Limiting initialisieren
            this.qrScanRateLimit.set(sessionId, []);

            console.log(`✅ Session ${sessionId} erfolgreich gestartet für ${user.Name}`);

            // Frontend benachrichtigen
            this.sendToRenderer('session-started', {
                sessionId: sessionId,
                userId: user.ID,
                userName: user.Name,
                startTime: sessionData.startTime,
                sessionType: sessionType.TypeName
            });

            return {
                success: true,
                sessionId: sessionId,
                userId: user.ID,
                userName: user.Name,
                sessionType: sessionType.TypeName
            };

        } catch (error) {
            console.error('❌ Session-Start Fehler:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async endSession(sessionId) {
        try {
            console.log(`🔚 Beende Session: ${sessionId}`);

            // Session lokal finden
            let sessionUserId = null;
            for (const [userId, sessionData] of this.activeSessions.entries()) {
                if (sessionData.sessionId === sessionId) {
                    sessionUserId = userId;
                    break;
                }
            }

            if (sessionUserId === null) {
                console.warn(`⚠️ Session ${sessionId} nicht in lokalen Sessions gefunden`);
                return { success: false, error: 'Session nicht gefunden' };
            }

            const sessionData = this.activeSessions.get(sessionUserId);

            // Session in Datenbank beenden
            const endResult = await this.dbClient.endSession(sessionId);

            if (endResult) {
                // Session-Timer stoppen
                this.stopSessionTimer(sessionId);

                // Lokale Session-Daten entfernen
                this.activeSessions.delete(sessionUserId);
                this.qrScanRateLimit.delete(sessionId);

                console.log(`✅ Session ${sessionId} erfolgreich beendet für Benutzer ${sessionData.userName}`);

                // Frontend benachrichtigen
                this.sendToRenderer('session-ended', {
                    sessionId: sessionId,
                    userId: sessionUserId,
                    userName: sessionData.userName,
                    duration: Date.now() - sessionData.startTime,
                    firstScans: sessionData.firstScans || 0,
                    completedScans: sessionData.completedScans || 0
                });

                return { success: true };

            } else {
                console.error('❌ Session in Datenbank nicht beendet');
                return { success: false, error: 'Datenbank-Fehler beim Beenden der Session' };
            }

        } catch (error) {
            console.error('❌ Session-Ende Fehler:', error);
            return { success: false, error: error.message };
        }
    }

    startSessionTimer(sessionId) {
        // Timer für Live-Updates
        const timer = setInterval(() => {
            this.sendToRenderer('session-timer-update', {
                sessionId: sessionId,
                timestamp: Date.now()
            });
        }, 1000); // Jede Sekunde aktualisieren

        this.activeSessionTimers.set(sessionId, timer);
    }

    stopSessionTimer(sessionId) {
        const timer = this.activeSessionTimers.get(sessionId);
        if (timer) {
            clearInterval(timer);
            this.activeSessionTimers.delete(sessionId);
        }
    }

    // ===== QR-CODE HANDLING FÜR QUALITÄTSKONTROLLE =====
    async handleQRScan(qrData, sessionId) {
        try {
            console.log(`📸 QR-Code gescannt - Session ${sessionId}: ${qrData.substring(0, 50)}...`);

            // Session-Daten abrufen
            let sessionData = null;
            for (const [userId, data] of this.activeSessions.entries()) {
                if (data.sessionId === sessionId) {
                    sessionData = data;
                    break;
                }
            }

            if (!sessionData) {
                return {
                    success: false,
                    error: 'Ungültige Session-ID'
                };
            }

            // Rate-Limiting prüfen
            const rateLimitResult = this.checkQRScanRateLimit(sessionId);
            if (!rateLimitResult.allowed) {
                return {
                    success: false,
                    error: `Zu viele Scans - warten Sie ${rateLimitResult.waitTime}s`
                };
            }

            // QR-Code Status prüfen
            const currentState = this.qrCodeStates.get(qrData);

            if (this.completedQRCodes.has(qrData)) {
                // DRITTER SCAN - FEHLER!
                return {
                    success: false,
                    error: 'Duplikat-Fehler: Karton bereits vollständig abgearbeitet',
                    scanType: 'duplicate_error',
                    qrData: qrData
                };
            }

            if (!currentState) {
                // ERSTER SCAN - Eingang der Bearbeitung
                console.log(`🔸 Erster Scan (Eingang): ${qrData.substring(0, 30)}`);

                // Status speichern
                this.qrCodeStates.set(qrData, {
                    status: 'first_scan',
                    sessionId: sessionId,
                    firstScanTime: Date.now(),
                    userId: sessionData.userId
                });

                // Statistiken aktualisieren
                sessionData.firstScans = (sessionData.firstScans || 0) + 1;

                // In Datenbank speichern
                await this.dbClient.saveQRScan(sessionId, qrData, {
                    scanType: 'quality_check_start',
                    sessionData: sessionData
                });

                // Dekodierung versuchen
                const decodedData = await this.decodeQRCode(qrData);

                return {
                    success: true,
                    scanType: 'first_scan',
                    message: 'Qualitätskontrolle gestartet - scannen Sie denselben Code erneut zum Abschluss',
                    qrData: qrData,
                    decodedData: decodedData,
                    sessionStats: {
                        firstScans: sessionData.firstScans,
                        completedScans: sessionData.completedScans || 0
                    }
                };

            } else if (currentState.status === 'first_scan') {
                // ZWEITER SCAN - Ausgang der Bearbeitung
                console.log(`🔹 Zweiter Scan (Ausgang): ${qrData.substring(0, 30)}`);

                // Status als komplett markieren
                this.qrCodeStates.set(qrData, {
                    ...currentState,
                    status: 'complete',
                    completedTime: Date.now()
                });

                this.completedQRCodes.add(qrData);

                // Statistiken aktualisieren
                sessionData.completedScans = (sessionData.completedScans || 0) + 1;

                // In Datenbank speichern
                await this.dbClient.saveQRScan(sessionId, qrData, {
                    scanType: 'quality_check_complete',
                    processingTime: Date.now() - currentState.firstScanTime,
                    sessionData: sessionData
                });

                // WICHTIG: Session nach zweitem Scan automatisch beenden
                console.log(`🎯 Qualitätskontrolle abgeschlossen - beende Session ${sessionId}`);

                const sessionEndResult = await this.endSession(sessionId);

                // Sofort neue Session für denselben Benutzer starten
                let newSessionInfo = null;
                if (sessionEndResult.success) {
                    const user = await this.dbClient.getUserByID(sessionData.userId);
                    if (user) {
                        const newSessionResult = await this.startSession(user);
                        if (newSessionResult.success) {
                            newSessionInfo = {
                                newSessionId: newSessionResult.sessionId,
                                newSessionStarted: true
                            };
                        }
                    }
                }

                // Dekodierung versuchen
                const decodedData = await this.decodeQRCode(qrData);

                return {
                    success: true,
                    scanType: 'second_scan',
                    message: 'Qualitätskontrolle abgeschlossen! Neue Session gestartet.',
                    qrData: qrData,
                    decodedData: decodedData,
                    processingTime: Date.now() - currentState.firstScanTime,
                    sessionCompleted: true,
                    sessionStats: {
                        firstScans: sessionData.firstScans,
                        completedScans: sessionData.completedScans
                    },
                    newSession: newSessionInfo
                };

            } else {
                // Unerwarteter Status
                return {
                    success: false,
                    error: 'Unerwarteter QR-Code Status',
                    qrData: qrData
                };
            }

        } catch (error) {
            console.error('❌ QR-Scan Handling Fehler:', error);
            return {
                success: false,
                error: error.message,
                qrData: qrData
            };
        }
    }

    checkQRScanRateLimit(sessionId) {
        const now = Date.now();
        const scans = this.qrScanRateLimit.get(sessionId) || [];

        // Alte Scans entfernen (älter als 1 Minute)
        const recentScans = scans.filter(time => now - time < 60000);

        if (recentScans.length >= this.maxQRScansPerMinute) {
            const oldestScan = Math.min(...recentScans);
            const waitTime = Math.ceil((60000 - (now - oldestScan)) / 1000);

            return {
                allowed: false,
                waitTime: waitTime
            };
        }

        // Scan-Zeit hinzufügen
        recentScans.push(now);
        this.qrScanRateLimit.set(sessionId, recentScans);

        return { allowed: true };
    }

    async decodeQRCode(qrData) {
        try {
            // QR-Code-Dekodierung delegieren an DatabaseUtils
            const decoded = await this.dbClient.decodeQRCode(qrData);

            // Globale Statistiken aktualisieren
            this.decodingStats.totalScans++;
            if (decoded && decoded.fields && decoded.fields.length > 0) {
                this.decodingStats.successfulDecodes++;

                // Spezifische Felder zählen
                decoded.fields.forEach(field => {
                    if (field.type === 'auftrag') this.decodingStats.withAuftrag++;
                    if (field.type === 'paket') this.decodingStats.withPaket++;
                    if (field.type === 'kunde') this.decodingStats.withKunde++;
                });
            }

            return decoded;

        } catch (error) {
            console.warn('⚠️ QR-Code Dekodierung fehlgeschlagen:', error);
            return {
                success: false,
                error: error.message,
                raw: qrData
            };
        }
    }

    // ===== STATISTICS =====
    getSessionStats(sessionId) {
        // Session-spezifische Statistiken
        let sessionData = null;
        for (const [userId, data] of this.activeSessions.entries()) {
            if (data.sessionId === sessionId) {
                sessionData = data;
                break;
            }
        }

        if (!sessionData) {
            return { error: 'Session nicht gefunden' };
        }

        // Rate-Limiting-Informationen
        const rateLimitData = this.qrScanRateLimit.get(sessionId) || [];
        const now = Date.now();
        const recentScans = rateLimitData.filter(time => now - time < 60000);

        const stats = {
            sessionId: sessionId,
            userId: sessionData.userId,
            userName: sessionData.userName,
            startTime: sessionData.startTime,
            duration: now - sessionData.startTime,
            firstScans: sessionData.firstScans || 0,
            completedScans: sessionData.completedScans || 0,
            totalScans: (sessionData.firstScans || 0) + (sessionData.completedScans || 0),
            rateLimitInfo: {
                scansInLastMinute: recentScans.length,
                maxScansPerMinute: this.maxQRScansPerMinute,
                nextScanAllowedIn: recentScans.length >= this.maxQRScansPerMinute ?
                    Math.ceil((60000 - (now - Math.min(...recentScans))) / 1000) : 0,
                lastScanTime: recentScans.length > 0 ? Math.max(...recentScans) : null
            }
        };

        return stats;
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
            sessionTypesSetup: this.systemStatus.sessionTypesSetup,
            sessionTypePriority: this.sessionTypePriority,
            lastError: this.systemStatus.lastError,
            timestamp: new Date().toISOString(),
            decodingStats: this.decodingStats,
            activeSessionCount: this.activeSessions.size,
            completedQRCodes: this.completedQRCodes.size
        });
    }

    // ===== CLEANUP =====
    async cleanup() {
        console.log('🧹 Anwendung wird bereinigt...');

        try {
            // Alle Session-Timer stoppen
            for (const sessionId of this.activeSessionTimers.keys()) {
                this.stopSessionTimer(sessionId);
            }

            // Alle aktiven Sessions beenden
            for (const [userId, sessionData] of this.activeSessions.entries()) {
                try {
                    await this.dbClient.endSession(sessionData.sessionId);
                    console.log(`Session ${sessionData.sessionId} für Benutzer ${userId} beendet`);
                } catch (error) {
                    console.error(`Fehler beim Beenden der Session ${sessionData.sessionId}:`, error);
                }
            }

            // Lokale Daten zurücksetzen
            this.activeSessions.clear();
            this.activeSessionTimers.clear();
            this.qrScanRateLimit.clear();
            this.qrCodeStates.clear();
            this.completedQRCodes.clear();

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
}

// ===== APP STARTUP =====
const app_instance = new QualitaetskontrolleMainApp();
app_instance.initialize().catch(error => {
    console.error('❌ App-Initialisierung fehlgeschlagen:', error);
    process.exit(1);
});

// Global Error Handlers
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    dialog.showErrorBox('Kritischer Fehler', `Unbehandelter Fehler: ${error.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection:', reason);
    console.error('Promise:', promise);
});

module.exports = QualitaetskontrolleMainApp;