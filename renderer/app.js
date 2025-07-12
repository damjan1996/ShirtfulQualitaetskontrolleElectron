/**
 * RFID Qualitätskontrolle - Hauptanwendung für Doppel-Scan-System
 * Ermöglicht mehreren Mitarbeitern gleichzeitig zu arbeiten
 * Spezialisiert auf Qualitätskontrolle mit Ein-/Ausgang-Scanning
 */

class QualitaetskontrolleApp {
    constructor() {
        // PARALLELE SESSION-VERWALTUNG
        this.activeSessions = new Map(); // userId -> sessionData
        this.selectedSession = null; // Aktuell ausgewählte Session für QR-Scanning
        this.sessionTimers = new Map(); // userId -> timerInterval

        // QUALITÄTSKONTROLLE-SPEZIFISCHE DATENSTRUKTUREN
        this.qrScanStates = new Map(); // qrCode -> scanState
        this.currentScan = null; // Aktueller Scan (egal ob erfolgreich oder nicht)
        this.successfulScans = []; // Alle erfolgreichen Scans (sitzungsübergreifend)

        // QR-Scanner Status
        this.scannerActive = false;
        this.videoStream = null;
        this.scanLoop = null;
        this.lastScanTime = 0;
        this.scanCooldown = 2000; // 2 Sekunden zwischen Scans

        // QR-Scanner Engine
        this.qrScanner = null;
        this.loadQRLibrary();

        // Verbesserte Duplikat-Vermeidung für Qualitätskontrolle
        this.globalScannedCodes = new Set();
        this.sessionScannedCodes = new Map(); // sessionId -> Set von QR-Codes
        this.recentlyScanned = new Map(); // Zeitbasierte Duplikat-Vermeidung
        this.pendingScans = new Set(); // Verhindert Race-Conditions
        this.lastProcessedQR = null;
        this.lastProcessedTime = 0;

        // Qualitätskontrolle Statistiken
        this.qualityStats = {
            totalBoxesStarted: 0,
            totalBoxesCompleted: 0,
            duplicateAttempts: 0,
            averageProcessingTime: 0,
            activeSessions: 0
        };

        this.init();
    }

    async init() {
        console.log('🚀 Qualitätskontrolle-App wird initialisiert...');

        this.setupEventListeners();
        this.setupIPCListeners();
        this.startClockUpdate();
        this.updateSystemInfo();

        // Kamera-Verfügbarkeit prüfen
        await this.checkCameraAvailability();

        // Aktive Sessions beim Start laden
        await this.loadInitialSessions();

        // Periodisches Laden der aktiven Sessions
        this.startPeriodicSessionUpdate();

        // Qualitätskontrolle-spezifische Updates
        this.startQualityStatsUpdate();

        console.log('✅ Qualitätskontrolle-App bereit');
    }

    async loadInitialSessions() {
        try {
            const sessions = await window.electronAPI.invoke('sessions:get-active');
            this.updateActiveSessions(sessions);
            console.log(`📋 ${sessions.length} aktive Sessions beim Start geladen`);
        } catch (error) {
            console.error('Fehler beim Laden der initialen Sessions:', error);
        }
    }

    // ===== EVENT LISTENERS =====
    setupEventListeners() {
        // Scanner Controls
        document.getElementById('startScannerBtn').addEventListener('click', () => {
            this.startQRScanner();
        });

        document.getElementById('stopScannerBtn').addEventListener('click', () => {
            this.stopQRScanner();
        });

        // Session Management
        document.getElementById('selectedUserLogout').addEventListener('click', () => {
            if (this.selectedSession) {
                this.logoutUser(this.selectedSession.sessionId);
            }
        });

        // Benutzer-Liste Event-Delegation
        document.getElementById('activeUsersList').addEventListener('click', (e) => {
            const userCard = e.target.closest('.user-card');
            if (userCard) {
                const userId = parseInt(userCard.dataset.userId);
                this.selectUser(userId);
            }

            // Logout-Button
            const logoutBtn = e.target.closest('.user-logout-btn');
            if (logoutBtn) {
                e.stopPropagation();
                const userId = parseInt(logoutBtn.closest('.user-card').dataset.userId);
                const session = this.activeSessions.get(userId);
                if (session) {
                    this.logoutUser(session.sessionId);
                }
            }
        });

        // RFID-Simulation
        const rfidSimInput = document.getElementById('rfidSimInput');
        const rfidSimBtn = document.getElementById('rfidSimBtn');

        if (rfidSimBtn) {
            rfidSimBtn.addEventListener('click', () => {
                const tagId = rfidSimInput.value.trim();
                if (tagId) {
                    this.simulateRFIDTag(tagId);
                    rfidSimInput.value = '';
                }
            });
        }

        if (rfidSimInput) {
            rfidSimInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    rfidSimBtn.click();
                }
            });
        }

        // Kamera-Zugriff Button
        const requestCameraBtn = document.getElementById('requestCameraAccess');
        if (requestCameraBtn) {
            requestCameraBtn.addEventListener('click', () => {
                this.requestCameraAccess();
            });
        }

        // Qualitätskontrolle-spezifische Buttons
        document.getElementById('resetQualityStats')?.addEventListener('click', () => {
            this.resetQualityStats();
        });

        console.log('✅ Event-Listener eingerichtet');
    }

    // ===== IPC LISTENERS =====
    setupIPCListeners() {
        // Session Events
        window.electronAPI.on('session-started', (sessionData) => {
            console.log('📢 Session gestartet:', sessionData);
            this.handleSessionStarted(sessionData);
        });

        window.electronAPI.on('session-ended', (data) => {
            console.log('📢 Session beendet:', data);
            this.handleSessionEnded(data);
        });

        window.electronAPI.on('sessions-updated', (sessions) => {
            console.log('📢 Sessions aktualisiert:', sessions);
            this.updateActiveSessions(sessions);
        });

        window.electronAPI.on('session-timer-update', (data) => {
            this.updateSessionTimer(data);
        });

        // RFID Events
        window.electronAPI.on('rfid-scan-success', (data) => {
            console.log('📢 RFID-Scan erfolgreich:', data);
            this.showNotification('success', 'RFID-Scan', `${data.action === 'login' ? 'Angemeldet' : 'Abgemeldet'}: ${data.user.Name}`);
        });

        window.electronAPI.on('rfid-scan-error', (data) => {
            console.log('📢 RFID-Scan Fehler:', data);
            this.showNotification('error', 'RFID-Fehler', data.message);
        });

        // Qualitätskontrolle-spezifische Events
        window.electronAPI.on('quality-stats-updated', (stats) => {
            this.qualityStats = stats;
            this.updateQualityStatsDisplay();
        });

        console.log('✅ IPC-Listener eingerichtet');
    }

    // ===== QR-SCANNER MANAGEMENT =====
    async loadQRLibrary() {
        try {
            // jsQR über CDN laden
            if (typeof jsQR === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js';
                script.onload = () => {
                    console.log('✅ jsQR-Bibliothek geladen');
                    this.qrScanner = jsQR;
                };
                script.onerror = () => {
                    console.error('❌ jsQR-Bibliothek konnte nicht geladen werden');
                };
                document.head.appendChild(script);
            } else {
                this.qrScanner = jsQR;
                console.log('✅ jsQR bereits verfügbar');
            }
        } catch (error) {
            console.error('Fehler beim Laden der QR-Bibliothek:', error);
        }
    }

    async checkCameraAvailability() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter(device => device.kind === 'videoinput');

            const cameraStatus = document.getElementById('cameraStatus');
            const cameraMessage = document.getElementById('cameraMessage');

            if (cameras.length > 0) {
                cameraStatus.className = 'camera-status available';
                cameraMessage.textContent = `${cameras.length} Kamera(s) verfügbar`;
                return true;
            } else {
                cameraStatus.className = 'camera-status unavailable';
                cameraMessage.textContent = 'Keine Kamera gefunden';
                return false;
            }
        } catch (error) {
            console.error('Fehler beim Prüfen der Kamera-Verfügbarkeit:', error);
            const cameraStatus = document.getElementById('cameraStatus');
            const cameraMessage = document.getElementById('cameraMessage');
            cameraStatus.className = 'camera-status error';
            cameraMessage.textContent = 'Kamera-Fehler';
            return false;
        }
    }

    async requestCameraAccess() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });

            // Stream wieder stoppen - nur für Berechtigung
            stream.getTracks().forEach(track => track.stop());

            this.showNotification('success', 'Kamera-Zugriff', 'Kamera-Berechtigung erteilt');
            await this.checkCameraAvailability();

        } catch (error) {
            console.error('Kamera-Zugriff fehlgeschlagen:', error);
            this.showNotification('error', 'Kamera-Fehler', 'Kamera-Zugriff verweigert');
        }
    }

    async startQRScanner() {
        if (this.scannerActive) {
            console.log('Scanner läuft bereits');
            return;
        }

        if (!this.selectedSession) {
            this.showNotification('warning', 'Kein Benutzer ausgewählt', 'Bitte wählen Sie zuerst einen Mitarbeiter aus');
            return;
        }

        try {
            console.log('📸 Starte QR-Scanner...');

            const video = document.getElementById('qrVideo');
            const canvas = document.getElementById('qrCanvas');

            // Kamera-Stream starten
            this.videoStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            video.srcObject = this.videoStream;
            video.play();

            // Warten bis Video geladen ist
            await new Promise((resolve) => {
                video.onloadedmetadata = resolve;
            });

            this.scannerActive = true;
            this.updateScannerUI();
            this.startScanLoop(video, canvas);

            console.log('✅ QR-Scanner gestartet');
            this.showNotification('success', 'Scanner gestartet', `Scanner aktiv für ${this.selectedSession.userName}`);

        } catch (error) {
            console.error('QR-Scanner Start fehlgeschlagen:', error);
            this.showNotification('error', 'Scanner-Fehler', 'QR-Scanner konnte nicht gestartet werden');
            this.scannerActive = false;
            this.updateScannerUI();
        }
    }

    stopQRScanner() {
        if (!this.scannerActive) {
            return;
        }

        console.log('⏹️ Stoppe QR-Scanner...');

        this.scannerActive = false;

        // Video-Stream stoppen
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => track.stop());
            this.videoStream = null;
        }

        // Scan-Loop stoppen
        if (this.scanLoop) {
            cancelAnimationFrame(this.scanLoop);
            this.scanLoop = null;
        }

        // Video zurücksetzen
        const video = document.getElementById('qrVideo');
        video.srcObject = null;

        this.updateScannerUI();
        console.log('✅ QR-Scanner gestoppt');
    }

    startScanLoop(video, canvas) {
        if (!this.qrScanner) {
            console.error('QR-Scanner-Bibliothek nicht verfügbar');
            this.stopQRScanner();
            return;
        }

        const context = canvas.getContext('2d');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const scanFrame = () => {
            if (!this.scannerActive) return;

            try {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                if (this.qrScanner) {
                    const qrData = this.qrScanner(imageData.data, imageData.width, imageData.height);

                    if (qrData && qrData.data) {
                        console.log('QR-Code erkannt:', qrData.data);
                        this.handleQRCodeDetected(qrData.data);
                    }
                }

            } catch (error) {
                console.error('QR-Scan-Fehler:', error);
            }

            if (this.scannerActive) {
                this.scanLoop = requestAnimationFrame(scanFrame);
            }
        };

        this.scanLoop = requestAnimationFrame(scanFrame);
        console.log('🔄 QR-Scan-Loop gestartet');
    }

    updateScannerUI() {
        const startBtn = document.getElementById('startScannerBtn');
        const stopBtn = document.getElementById('stopScannerBtn');
        const statusText = document.getElementById('scannerStatusText');
        const cameraStatus = document.getElementById('cameraStatus');

        if (this.scannerActive) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-flex';
            statusText.textContent = `Scanner aktiv für ${this.selectedSession?.userName || 'Unbekannt'}`;
            cameraStatus.style.display = 'none';
        } else {
            startBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
            statusText.textContent = 'Scanner gestoppt';
            cameraStatus.style.display = 'flex';
        }
    }

    // ===== QUALITÄTSKONTROLLE QR-CODE VERARBEITUNG =====
    async handleQRCodeDetected(qrData) {
        const now = Date.now();

        // Prüfe ob ein Benutzer ausgewählt ist
        if (!this.selectedSession) {
            this.showNotification('warning', 'Kein Benutzer ausgewählt', 'Bitte wählen Sie zuerst einen Mitarbeiter aus');
            return;
        }

        // Sofortige Duplikat-Prüfung (identischer Code + Zeit)
        if (this.lastProcessedQR === qrData && (now - this.lastProcessedTime) < this.scanCooldown) {
            console.log('🔄 Identischer QR-Code innerhalb Cooldown ignoriert');
            return;
        }

        // Prüfung auf kürzlich gescannte Codes
        const recentScanTime = this.recentlyScanned.get(qrData);
        if (recentScanTime && (now - recentScanTime) < this.scanCooldown) {
            console.log(`🔄 QR-Code zu schnell erneut gescannt (${now - recentScanTime}ms < ${this.scanCooldown}ms)`);
            return;
        }

        // Prüfung auf pending Scans
        if (this.pendingScans.has(qrData)) {
            console.log('🔄 QR-Code wird bereits verarbeitet');
            return;
        }

        // Als pending markieren
        this.pendingScans.add(qrData);
        this.lastProcessedQR = qrData;
        this.lastProcessedTime = now;

        try {
            console.log(`🔍 Verarbeite QR-Code: "${qrData}"`);

            // Aktuellen Scan setzen
            this.currentScan = {
                qrData,
                timestamp: now,
                sessionId: this.selectedSession.sessionId,
                status: 'processing'
            };

            this.updateCurrentScanDisplay();

            // QR-Code an Main-Process senden
            const result = await window.electronAPI.invoke('qr:process-scan', qrData, this.selectedSession.sessionId);

            // Erfolg verarbeiten
            if (result.success) {
                this.handleQRScanSuccess(result, qrData);
            } else {
                this.handleQRScanError(result, qrData);
            }

            // In recentlyScanned eintragen
            this.recentlyScanned.set(qrData, now);

            // Alte Einträge aus recentlyScanned entfernen (5 Minuten)
            const cutoffTime = now - 300000;
            for (const [code, time] of this.recentlyScanned.entries()) {
                if (time < cutoffTime) {
                    this.recentlyScanned.delete(code);
                }
            }

        } catch (error) {
            console.error('Fehler bei QR-Code-Verarbeitung:', error);
            this.handleQRScanError({
                success: false,
                status: 'error',
                message: `Verarbeitungsfehler: ${error.message}`
            }, qrData);

        } finally {
            // Aus pending entfernen
            this.pendingScans.delete(qrData);
        }
    }

    handleQRScanSuccess(result, qrData) {
        this.currentScan.status = 'success';
        this.currentScan.result = result;

        // Status-spezifische Behandlung
        if (result.status === 'first_scan') {
            console.log(`✅ ERSTER SCAN: ${qrData} - Bearbeitung gestartet`);
            this.showScanSuccess('Bearbeitung gestartet', `Karton: ${qrData}`, 'first-scan');

            // QR-State aktualisieren
            this.qrScanStates.set(qrData, {
                scanCount: 1,
                status: 'in_progress',
                sessionId: this.selectedSession.sessionId
            });

        } else if (result.status === 'second_scan_complete') {
            console.log(`✅ ZWEITER SCAN: ${qrData} - Bearbeitung abgeschlossen`);
            this.showScanSuccess('Karton abgeschlossen!', result.message, 'second-scan');

            // QR-State aktualisieren
            this.qrScanStates.set(qrData, {
                scanCount: 2,
                status: 'completed'
            });

            // Session wird automatisch beendet und neu gestartet
            this.showNotification('success', 'Session beendet', 'Neue Session automatisch gestartet');
        }

        // Zu erfolgreichen Scans hinzufügen
        this.successfulScans.unshift({
            qrData,
            timestamp: this.currentScan.timestamp,
            sessionId: this.selectedSession.sessionId,
            userName: this.selectedSession.userName,
            status: result.status,
            processingTime: result.data?.processingTime
        });

        // Liste auf 20 Einträge begrenzen
        if (this.successfulScans.length > 20) {
            this.successfulScans = this.successfulScans.slice(0, 20);
        }

        this.updateCurrentScanDisplay();
        this.updateScanHistoryDisplay();
        this.updateQualityStatsDisplay();
    }

    handleQRScanError(result, qrData) {
        this.currentScan.status = 'error';
        this.currentScan.result = result;

        let errorTitle = 'Scan-Fehler';
        let errorClass = 'error';

        // Status-spezifische Fehlerbehandlung
        switch (result.status) {
            case 'duplicate_completed_box':
                errorTitle = 'DUPLIKAT-FEHLER';
                errorClass = 'duplicate-error';
                this.showScanError(errorTitle, result.message, errorClass);
                break;

            case 'wrong_session':
                errorTitle = 'Falscher Mitarbeiter';
                this.showScanError(errorTitle, result.message, 'warning');
                break;

            case 'rate_limited':
                errorTitle = 'Zu schnell';
                this.showScanError(errorTitle, result.message, 'warning');
                break;

            default:
                this.showScanError(errorTitle, result.message || 'Unbekannter Fehler', 'error');
        }

        console.log(`❌ QR-Scan Fehler: ${qrData} - ${result.message}`);

        this.updateCurrentScanDisplay();
    }

    // ===== UI-UPDATES =====

    updateCurrentScanDisplay() {
        const currentScanInfo = document.getElementById('currentScanInfo');
        const scanStatus = document.getElementById('scanStatus');

        if (!this.currentScan) {
            currentScanInfo.textContent = 'Bereit zum Scannen';
            scanStatus.className = 'scan-status ready';
            return;
        }

        const timeStr = new Date(this.currentScan.timestamp).toLocaleTimeString();
        currentScanInfo.textContent = `${timeStr}: ${this.currentScan.qrData}`;

        switch (this.currentScan.status) {
            case 'processing':
                scanStatus.className = 'scan-status processing';
                break;
            case 'success':
                scanStatus.className = 'scan-status success';
                break;
            case 'error':
                scanStatus.className = 'scan-status error';
                break;
        }
    }

    updateScanHistoryDisplay() {
        const historyList = document.getElementById('scanHistoryList');
        historyList.innerHTML = '';

        this.successfulScans.slice(0, 10).forEach(scan => {
            const listItem = document.createElement('div');
            listItem.className = 'scan-history-item';

            const timeStr = new Date(scan.timestamp).toLocaleTimeString();
            const statusText = scan.status === 'first_scan' ? 'Gestartet' : 'Abgeschlossen';
            const processingTime = scan.processingTime ?
                ` (${this.formatDuration(scan.processingTime)})` : '';

            listItem.innerHTML = `
                <div class="scan-time">${timeStr}</div>
                <div class="scan-qr">${scan.qrData}</div>
                <div class="scan-status-text ${scan.status}">${statusText}${processingTime}</div>
                <div class="scan-user">${scan.userName}</div>
            `;

            historyList.appendChild(listItem);
        });

        // Scan-Counter aktualisieren
        const scanCount = document.getElementById('scanCount');
        const sessionScans = this.selectedSession ?
            this.successfulScans.filter(s => s.sessionId === this.selectedSession.sessionId).length : 0;
        scanCount.textContent = sessionScans;
    }

    updateQualityStatsDisplay() {
        // Haupt-Statistiken
        document.getElementById('totalBoxesStarted').textContent = this.qualityStats.totalBoxesStarted;
        document.getElementById('totalBoxesCompleted').textContent = this.qualityStats.totalBoxesCompleted;
        document.getElementById('duplicateAttempts').textContent = this.qualityStats.duplicateAttempts;

        // Fortschritt berechnen
        const inProgress = this.qualityStats.totalBoxesStarted - this.qualityStats.totalBoxesCompleted;
        document.getElementById('boxesInProgress').textContent = inProgress;

        // Completion Rate
        const completionRate = this.qualityStats.totalBoxesStarted > 0 ?
            (this.qualityStats.totalBoxesCompleted / this.qualityStats.totalBoxesStarted * 100).toFixed(1) : 0;
        document.getElementById('completionRate').textContent = `${completionRate}%`;

        // Durchschnittliche Bearbeitungszeit
        const avgTime = this.qualityStats.averageProcessingTime;
        document.getElementById('averageProcessingTime').textContent =
            avgTime > 0 ? this.formatDuration(avgTime) : '-';
    }

    // ===== SESSION MANAGEMENT =====

    handleSessionStarted(sessionData) {
        this.activeSessions.set(sessionData.userId, sessionData);
        this.updateActiveUsersList();
        this.updateSystemInfo();

        // UI von Login zu Workspace wechseln
        this.switchToWorkspace();

        // Qualitätskontrolle-spezifisch: Session automatisch auswählen wenn keine ausgewählt
        if (!this.selectedSession) {
            this.selectUser(sessionData.userId);
        }

        this.showNotification('success', 'Anmeldung erfolgreich', `${sessionData.userName} ist jetzt angemeldet`);
    }

    // UI-Umschaltung zwischen Login und Workspace
    switchToWorkspace() {
        const loginSection = document.getElementById('loginSection');
        const workspace = document.getElementById('workspace');

        if (loginSection && workspace) {
            loginSection.style.display = 'none';
            workspace.style.display = 'grid';
            console.log('✅ UI zu Workspace gewechselt');
        }
    }

    switchToLogin() {
        const loginSection = document.getElementById('loginSection');
        const workspace = document.getElementById('workspace');

        if (loginSection && workspace) {
            loginSection.style.display = 'flex';
            workspace.style.display = 'none';
            console.log('✅ UI zu Login gewechselt');
        }
    }

    handleSessionEnded(data) {
        this.activeSessions.delete(data.userId);

        // Falls die ausgewählte Session beendet wurde
        if (this.selectedSession && this.selectedSession.sessionId === data.sessionId) {
            // Scanner stoppen
            this.stopQRScanner();

            // Session-Auswahl zurücksetzen
            this.selectedSession = null;
            this.updateSelectedUserPanel();
        }

        this.updateActiveUsersList();
        this.updateSystemInfo();

        // Wenn keine aktiven Sessions mehr vorhanden sind, zurück zum Login
        if (this.activeSessions.size === 0) {
            this.switchToLogin();
        }

        this.showNotification('info', 'Abmeldung', `${data.userName} wurde abgemeldet`);
    }

    updateActiveSessions(sessions) {
        this.activeSessions.clear();
        sessions.forEach(session => {
            this.activeSessions.set(session.userId, session);
        });

        this.updateActiveUsersList();
        this.updateSystemInfo();

        // UI-Zustand basierend auf aktiven Sessions setzen
        if (this.activeSessions.size > 0) {
            this.switchToWorkspace();

            // Wenn noch keine Session ausgewählt ist, erste Session auswählen
            if (!this.selectedSession && sessions.length > 0) {
                this.selectUser(sessions[0].userId);
            }
        } else {
            this.switchToLogin();
        }
    }

    updateActiveUsersList() {
        const usersList = document.getElementById('activeUsersList');
        const userCount = document.getElementById('activeUserCount');

        usersList.innerHTML = '';
        userCount.textContent = this.activeSessions.size;

        if (this.activeSessions.size === 0) {
            usersList.innerHTML = `
                <div class="no-users-message">
                    <p>Keine aktiven Mitarbeiter</p>
                    <p>RFID-Tag scannen zum Anmelden</p>
                </div>
            `;
            return;
        }

        this.activeSessions.forEach((session, userId) => {
            const userCard = document.createElement('div');
            userCard.className = `user-card ${this.selectedSession?.userId === userId ? 'selected' : ''}`;
            userCard.dataset.userId = userId;

            const duration = Date.now() - session.startTime;
            const sessionScans = this.successfulScans.filter(s => s.sessionId === session.sessionId).length;

            userCard.innerHTML = `
                <div class="user-info">
                    <div class="user-avatar">👤</div>
                    <div class="user-details">
                        <div class="user-name">${session.userName}</div>
                        <div class="user-session-time">${this.formatDuration(duration)}</div>
                        <div class="user-scan-count">${sessionScans} Scans</div>
                    </div>
                    <button class="user-logout-btn" title="Abmelden">🔓</button>
                </div>
            `;

            usersList.appendChild(userCard);
        });
    }

    selectUser(userId) {
        const session = this.activeSessions.get(userId);
        if (!session) {
            console.error('Session nicht gefunden:', userId);
            return;
        }

        console.log('👤 Benutzer ausgewählt:', session.userName);

        // Scanner stoppen falls aktiv
        if (this.scannerActive) {
            this.stopQRScanner();
        }

        this.selectedSession = session;
        this.updateSelectedUserPanel();
        this.updateActiveUsersList();
        this.updateScanHistoryDisplay();

        this.showNotification('info', 'Benutzer ausgewählt', `${session.userName} für QR-Scanning aktiv`);
    }

    updateSelectedUserPanel() {
        const panel = document.getElementById('selectedUserPanel');
        const userName = document.getElementById('selectedUserName');
        const sessionTime = document.getElementById('selectedSessionTime');
        const sessionScans = document.getElementById('selectedSessionScans');
        const scannerUserInfo = document.getElementById('scannerUserInfo');

        if (!this.selectedSession) {
            panel.style.display = 'none';
            scannerUserInfo.textContent = 'Wählen Sie einen Mitarbeiter aus';
            return;
        }

        panel.style.display = 'block';
        userName.textContent = this.selectedSession.userName;

        const duration = Date.now() - this.selectedSession.startTime;
        sessionTime.textContent = this.formatDuration(duration);

        const scans = this.successfulScans.filter(s => s.sessionId === this.selectedSession.sessionId).length;
        sessionScans.textContent = scans;

        scannerUserInfo.textContent = `Scanner bereit für ${this.selectedSession.userName}`;
    }

    updateSessionTimer(data) {
        if (this.selectedSession && this.selectedSession.sessionId === data.sessionId) {
            const sessionTime = document.getElementById('selectedSessionTime');
            sessionTime.textContent = data.formattedDuration;
        }

        // Benutzer-Liste aktualisieren
        this.updateActiveUsersList();
    }

    async logoutUser(sessionId) {
        try {
            const result = await window.electronAPI.invoke('sessions:end-session', sessionId);
            if (result) {
                this.showNotification('success', 'Abmeldung', 'Benutzer erfolgreich abgemeldet');
            } else {
                this.showNotification('error', 'Abmeldung fehlgeschlagen', 'Session konnte nicht beendet werden');
            }
        } catch (error) {
            console.error('Logout-Fehler:', error);
            this.showNotification('error', 'Logout-Fehler', error.message);
        }
    }

    // ===== RFID SIMULATION =====
    async simulateRFIDTag(tagId) {
        try {
            console.log(`🧪 Simuliere RFID-Tag: ${tagId}`);
            const result = await window.electronAPI.invoke('rfid:simulate-tag', tagId);

            if (result.success) {
                const action = result.action === 'login' ? 'Angemeldet' : 'Abgemeldet';
                this.showNotification('success', 'RFID-Simulation', `${action}: ${result.user.Name}`);
            } else {
                this.showNotification('error', 'RFID-Simulation', result.reason || 'Unbekannter Fehler');
            }
        } catch (error) {
            console.error('RFID-Simulation Fehler:', error);
            this.showNotification('error', 'RFID-Simulation', error.message);
        }
    }

    // ===== QUALITÄTSKONTROLLE-SPEZIFISCHE FUNKTIONEN =====

    async resetQualityStats() {
        try {
            const result = await window.electronAPI.invoke('quality:reset-stats');
            if (result) {
                this.qualityStats = {
                    totalBoxesStarted: 0,
                    totalBoxesCompleted: 0,
                    duplicateAttempts: 0,
                    averageProcessingTime: 0,
                    activeSessions: this.activeSessions.size
                };
                this.updateQualityStatsDisplay();
                this.showNotification('success', 'Statistiken zurückgesetzt', 'Alle Qualitätskontrolle-Statistiken wurden zurückgesetzt');
            }
        } catch (error) {
            console.error('Fehler beim Zurücksetzen der Statistiken:', error);
            this.showNotification('error', 'Fehler', 'Statistiken konnten nicht zurückgesetzt werden');
        }
    }

    startQualityStatsUpdate() {
        setInterval(async () => {
            try {
                const stats = await window.electronAPI.invoke('quality:get-stats');
                this.qualityStats = stats;
                this.updateQualityStatsDisplay();
            } catch (error) {
                console.error('Fehler beim Aktualisieren der Qualitätskontrolle-Statistiken:', error);
            }
        }, 5000); // Alle 5 Sekunden aktualisieren
    }

    // ===== VISUAL FEEDBACK =====

    showScanSuccess(title, message, type = 'success') {
        // Erfolgs-Overlay anzeigen
        this.showOverlay(title, message, type, 2000);

        // Audio-Feedback
        this.playSuccessSound();

        // Visueller Erfolgs-Effekt
        document.body.classList.add('scan-success');
        setTimeout(() => {
            document.body.classList.remove('scan-success');
        }, 1000);
    }

    showScanError(title, message, type = 'error') {
        // Fehler-Overlay anzeigen
        this.showOverlay(title, message, type, 3000);

        // Audio-Feedback
        this.playErrorSound();

        // Visueller Fehler-Effekt
        document.body.classList.add('scan-error');
        setTimeout(() => {
            document.body.classList.remove('scan-error');
        }, 1000);
    }

    showOverlay(title, message, type, duration = 2000) {
        const overlay = document.createElement('div');
        overlay.className = `scan-overlay ${type}`;
        overlay.innerHTML = `
            <div class="overlay-content">
                <div class="overlay-title">${title}</div>
                <div class="overlay-message">${message}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Automatisch entfernen
        setTimeout(() => {
            overlay.remove();
        }, duration);
    }

    playSuccessSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmseAiyJ0/TSfCkHKHvJ7+OZSA4PW6/n77BdGAg+ltryxnkpBSl+0fPTgjMKFGS+8OScTgwOUarm7LFBF0BoouTdqWUdBj6T2/LMeiMGLYTK7+CSPwsXZaHv5ZtLDQ1Qp+XxsmMdCTmB0vTZcicFKHzN8Nw=');
            audio.volume = 0.3;
            audio.play().catch(() => {}); // Fehler ignorieren
        } catch (error) {
            // Audio-Fehler ignorieren
        }
    }

    playErrorSound() {
        try {
            const audio = new Audio('data:audio/wav;base64,UklGRuoCAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YdoCAAC4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4uLi4');
            audio.volume = 0.2;
            audio.play().catch(() => {}); // Fehler ignorieren
        } catch (error) {
            // Audio-Fehler ignorieren
        }
    }

    // ===== UTILITY FUNCTIONS =====

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        } else {
            return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
        }
    }

    showNotification(type, title, message) {
        console.log(`📢 ${type.toUpperCase()}: ${title} - ${message}`);

        // Notification-Element erstellen
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
            </div>
        `;

        // Zur Seite hinzufügen
        document.body.appendChild(notification);

        // Nach 4 Sekunden entfernen
        setTimeout(() => {
            notification.remove();
        }, 4000);
    }

    startClockUpdate() {
        const updateClock = () => {
            const now = new Date();
            const timeString = now.toLocaleTimeString('de-DE');
            const clockElement = document.getElementById('currentTime');
            if (clockElement) {
                clockElement.textContent = timeString;
            }
        };

        updateClock();
        setInterval(updateClock, 1000);
    }

    async updateSystemInfo() {
        try {
            const status = await window.electronAPI.invoke('system:get-status');

            const statusElement = document.getElementById('systemStatus');
            const statusText = statusElement.querySelector('.status-text');
            const statusDot = statusElement.querySelector('.status-dot');

            if (status.database && status.rfid) {
                statusText.textContent = 'System bereit';
                statusDot.className = 'status-dot online';
            } else if (status.database) {
                statusText.textContent = 'RFID nicht verfügbar';
                statusDot.className = 'status-dot warning';
            } else {
                statusText.textContent = 'System-Fehler';
                statusDot.className = 'status-dot offline';
            }

            // Qualitätskontrolle-Statistiken aktualisieren
            if (status.qualityStats) {
                this.qualityStats = status.qualityStats;
                this.updateQualityStatsDisplay();
            }

        } catch (error) {
            console.error('Fehler beim Aktualisieren der System-Info:', error);
        }
    }

    startPeriodicSessionUpdate() {
        setInterval(async () => {
            try {
                const sessions = await window.electronAPI.invoke('sessions:get-active');
                this.updateActiveSessions(sessions);

                // Selected session aktualisieren
                if (this.selectedSession) {
                    const updatedSession = sessions.find(s => s.sessionId === this.selectedSession.sessionId);
                    if (updatedSession) {
                        this.selectedSession = updatedSession;
                        this.updateSelectedUserPanel();
                    } else {
                        // Session nicht mehr aktiv
                        this.selectedSession = null;
                        this.updateSelectedUserPanel();
                        this.stopQRScanner();
                    }
                }

            } catch (error) {
                console.error('Fehler beim periodischen Session-Update:', error);
            }
        }, 2000); // Alle 2 Sekunden
    }
}

// App initialisieren wenn DOM geladen ist
document.addEventListener('DOMContentLoaded', () => {
    new QualitaetskontrolleApp();
});