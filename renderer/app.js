/**
 * Qualitätskontrolle RFID QR Scanner - Frontend-Anwendung
 * Speziell angepasst für zweimaliges Scannen und automatischen Session-Abschluss
 */

class QualitaetskontrolleApp {
    constructor() {
        // ===== STATUS TRACKING =====
        this.systemStatus = {
            database: false,
            rfid: false,
            sessionTypesSetup: false,
            lastError: null
        };

        // ===== SESSION MANAGEMENT (Parallele Sessions) =====
        this.activeSessions = new Map(); // userId -> sessionData
        this.selectedSession = null; // Aktuell ausgewählte Session für QR-Scanning
        this.sessionTimers = new Map(); // sessionId -> interval

        // ===== QR-SCANNER STATUS =====
        this.qrScanner = {
            active: false,
            stream: null,
            video: null,
            canvas: null,
            context: null,
            animationFrame: null
        };

        // ===== QR-CODE TRACKING (Qualitätskontrolle-spezifisch) =====
        this.sessionScannedCodes = new Map(); // sessionId -> { qrCode: status }
        this.lastScanTime = 0;
        this.scanCooldown = 1000; // 1 Sekunde zwischen Scans

        // ===== STATISTIKEN =====
        this.globalStats = {
            decodingStats: {
                totalScans: 0,
                successfulDecodes: 0,
                withAuftrag: 0,
                withPaket: 0,
                withKunde: 0
            },
            activeSessionCount: 0,
            completedQRCodes: 0
        };

        // ===== UI UPDATE TRACKING =====
        this.lastUIUpdate = 0;
        this.uiUpdateThrottle = 500; // Max alle 500ms UI-Updates

        // ===== AUDIO FEEDBACK =====
        this.audioEnabled = true;
        this.audioContext = null;

        // ===== PERFORMANCE TRACKING =====
        this.performanceMetrics = {
            scanCount: 0,
            averageScanTime: 0,
            lastScanTimes: []
        };
    }

    // ===== INITIALIZATION =====
    async initialize() {
        console.log('🚀 Initialisiere Qualitätskontrolle-Frontend...');

        try {
            // DOM-Elemente finden
            this.initializeDOMElements();

            // Event-Listener registrieren
            this.registerEventListeners();

            // Keyboard-Listener für RFID
            this.initializeKeyboardListener();

            // System-Status abrufen
            await this.loadSystemStatus();

            // Audio-Context initialisieren (mit User-Interaction)
            this.initializeAudioContext();

            console.log('✅ Frontend erfolgreich initialisiert');

        } catch (error) {
            console.error('❌ Frontend-Initialisierung fehlgeschlagen:', error);
            this.showErrorModal('Initialisierung fehlgeschlagen', error.message);
        }
    }

    initializeDOMElements() {
        // Login-Bereich
        this.loginSection = document.getElementById('loginSection');
        this.loginStatus = document.getElementById('loginStatus');

        // Arbeitsbereich
        this.workspaceSection = document.getElementById('workspaceSection');
        this.usersSidebar = document.getElementById('usersSidebar');
        this.usersList = document.getElementById('usersList');
        this.userCount = document.getElementById('userCount');

        // Ausgewählter Benutzer Panel
        this.selectedUserPanel = document.getElementById('selectedUserPanel');

        // Scanner-Bereich
        this.scannerSection = document.getElementById('scannerSection');
        this.qrVideo = document.getElementById('qrVideo');
        this.scannerCanvas = document.getElementById('scannerCanvas');
        this.scannerStatus = document.getElementById('scannerStatus');
        this.startScannerBtn = document.getElementById('startScannerBtn');
        this.stopScannerBtn = document.getElementById('stopScannerBtn');

        // Scan-Historie
        this.scanHistoryContainer = document.getElementById('scanHistoryContainer');
        this.scanHistoryList = document.getElementById('scanHistoryList');

        // Status-Anzeigen
        this.systemStatus = document.getElementById('systemStatus');
        this.currentTime = document.getElementById('currentTime');

        // Statistiken
        this.globalStatsContainer = document.getElementById('globalStatsContainer');

        // Modals
        this.errorModal = document.getElementById('errorModal');

        console.log('✅ DOM-Elemente initialisiert');
    }

    registerEventListeners() {
        // Scanner-Buttons
        if (this.startScannerBtn) {
            this.startScannerBtn.addEventListener('click', () => this.startQRScanner());
        }

        if (this.stopScannerBtn) {
            this.stopScannerBtn.addEventListener('click', () => this.stopQRScanner());
        }

        // Modal-Handling
        document.addEventListener('click', (event) => {
            if (event.target.classList.contains('modal')) {
                this.hideModal(event.target.id);
            }
        });

        // Escape-Key für Modals
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const openModal = document.querySelector('.modal.show');
                if (openModal) {
                    this.hideModal(openModal.id);
                }
            }
        });

        // IPC-Event-Listener
        this.registerIPCListeners();

        console.log('✅ Event-Listener registriert');
    }

    registerIPCListeners() {
        // System-Status Updates
        window.electronAPI.system.onReady((event, data) => {
            this.handleSystemReady(data);
        });

        // Session-Events
        window.electronAPI.session.onSessionStarted((event, data) => {
            this.handleSessionStarted(data);
        });

        window.electronAPI.session.onSessionEnded((event, data) => {
            this.handleSessionEnded(data);
        });

        window.electronAPI.session.onSessionTimerUpdate((event, data) => {
            this.handleSessionTimerUpdate(data);
        });

        console.log('✅ IPC-Listener registriert');
    }

    initializeKeyboardListener() {
        let rfidBuffer = '';
        let rfidTimeout = null;

        document.addEventListener('keydown', (event) => {
            // Nur verarbeiten wenn kein Input-Element aktiv ist
            if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
                return;
            }

            // RFID-Input sammeln
            if (event.key === 'Enter') {
                if (rfidBuffer.length > 0) {
                    console.log(`🏷️ RFID-Tag erkannt: ${rfidBuffer}`);
                    this.handleRFIDInput(rfidBuffer);
                    rfidBuffer = '';
                }
                clearTimeout(rfidTimeout);
            } else if (event.key.length === 1) {
                rfidBuffer += event.key;

                // Timeout zurücksetzen
                clearTimeout(rfidTimeout);
                rfidTimeout = setTimeout(() => {
                    rfidBuffer = '';
                }, 1000);
            }
        });

        console.log('✅ Keyboard-Listener für RFID initialisiert');
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('✅ Audio-Context initialisiert');
        } catch (error) {
            console.warn('⚠️ Audio-Context nicht verfügbar:', error);
            this.audioEnabled = false;
        }
    }

    // ===== SYSTEM STATUS =====
    async loadSystemStatus() {
        try {
            const status = await window.electronAPI.system.getStatus();
            this.handleSystemReady(status);
        } catch (error) {
            console.error('❌ System-Status laden fehlgeschlagen:', error);
        }
    }

    handleSystemReady(data) {
        console.log('📊 System-Status Update:', data);

        this.systemStatus = {
            database: data.database,
            rfid: data.rfid,
            sessionTypesSetup: data.sessionTypesSetup,
            lastError: data.lastError
        };

        // UI aktualisieren
        this.updateSystemStatusDisplay();
        this.updateGlobalStats(data);

        // Sessions laden wenn System bereit
        if (data.database && data.sessionTypesSetup) {
            this.loadActiveSessions();
        }
    }

    updateSystemStatusDisplay() {
        if (!this.systemStatus) return;

        const statusElement = this.systemStatus;
        const isSystemReady = this.systemStatus.database && this.systemStatus.sessionTypesSetup;

        if (isSystemReady) {
            statusElement.className = 'status-indicator ready';
            statusElement.innerHTML = `
                <div class="status-dot"></div>
                <span class="status-text">System bereit</span>
            `;
        } else {
            statusElement.className = 'status-indicator error';
            statusElement.innerHTML = `
                <div class="status-dot"></div>
                <span class="status-text">System nicht bereit</span>
            `;
        }

        // Letzte Aktualisierung anzeigen
        if (this.currentTime) {
            this.currentTime.textContent = qualityUtils.getCurrentTime();
        }
    }

    // ===== SESSION MANAGEMENT =====
    async loadActiveSessions() {
        try {
            const sessions = await window.electronAPI.session.getAllActive();
            console.log('📋 Aktive Sessions geladen:', sessions);

            // Sessions-Map aktualisieren
            this.activeSessions.clear();
            sessions.forEach(session => {
                this.activeSessions.set(session.userId, session);

                // Session-Timer starten
                this.startSessionTimer(session.sessionId);
            });

            // UI aktualisieren
            this.updateSessionsDisplay();
            this.updateWorkspaceVisibility();

        } catch (error) {
            console.error('❌ Sessions laden fehlgeschlagen:', error);
        }
    }

    handleSessionStarted(data) {
        console.log('🎬 Session gestartet:', data);

        // Session zur lokalen Map hinzufügen
        this.activeSessions.set(data.userId, {
            sessionId: data.sessionId,
            userId: data.userId,
            userName: data.userName,
            startTime: data.startTime,
            sessionType: data.sessionType,
            duration: 0,
            firstScans: 0,
            completedScans: 0,
            totalScans: 0
        });

        // Session-Timer starten
        this.startSessionTimer(data.sessionId);

        // UI aktualisieren
        this.updateSessionsDisplay();
        this.updateWorkspaceVisibility();

        // Audio-Feedback
        this.playSuccessSound();

        // Notification
        this.showNotification('success', 'Session gestartet', `${data.userName} ist angemeldet`);
    }

    handleSessionEnded(data) {
        console.log('🔚 Session beendet:', data);

        // Session aus lokaler Map entfernen
        this.activeSessions.delete(data.userId);

        // Session-Timer stoppen
        this.stopSessionTimer(data.sessionId);

        // Ausgewählte Session zurücksetzen wenn betroffen
        if (this.selectedSession && this.selectedSession.sessionId === data.sessionId) {
            this.selectedSession = null;
            this.stopQRScanner();
        }

        // Gescannte Codes für diese Session entfernen
        this.sessionScannedCodes.delete(data.sessionId);

        // UI aktualisieren
        this.updateSessionsDisplay();
        this.updateWorkspaceVisibility();

        // Notification
        this.showNotification('info', 'Session beendet', `${data.userName} abgemeldet (${qualityUtils.formatDuration(data.duration)})`);
    }

    handleSessionTimerUpdate(data) {
        // Lokale Session-Daten aktualisieren
        for (const [userId, session] of this.activeSessions.entries()) {
            if (session.sessionId === data.sessionId) {
                session.duration = data.timestamp - session.startTime;
                break;
            }
        }

        // UI throttled aktualisieren
        this.throttledUpdateSessionsDisplay();
    }

    startSessionTimer(sessionId) {
        if (!this.sessionTimers.has(sessionId)) {
            const timer = setInterval(() => {
                this.updateSessionTimer(sessionId);
            }, 1000);

            this.sessionTimers.set(sessionId, timer);
        }
    }

    stopSessionTimer(sessionId) {
        const timer = this.sessionTimers.get(sessionId);
        if (timer) {
            clearInterval(timer);
            this.sessionTimers.delete(sessionId);
        }
    }

    updateSessionTimer(sessionId) {
        // Session in DOM finden und Timer aktualisieren
        const sessionElement = document.querySelector(`[data-session-id="${sessionId}"]`);
        if (sessionElement) {
            const timerElement = sessionElement.querySelector('.user-timer');
            if (timerElement) {
                // Timer-Wert aus Session-Daten berechnen
                for (const [userId, session] of this.activeSessions.entries()) {
                    if (session.sessionId === sessionId) {
                        const duration = Date.now() - session.startTime;
                        timerElement.textContent = qualityUtils.formatDuration(duration);
                        break;
                    }
                }
            }
        }
    }

    updateSessionsDisplay() {
        if (!this.usersList || !this.userCount) return;

        const sessions = Array.from(this.activeSessions.values());

        // Benutzeranzahl aktualisieren
        this.userCount.textContent = sessions.length;

        if (sessions.length === 0) {
            this.usersList.innerHTML = '<div class="no-users">Keine aktiven Sessions</div>';
            return;
        }

        // Sessions sortieren nach Namen
        sessions.sort((a, b) => a.userName.localeCompare(b.userName));

        // Session-Liste erstellen
        this.usersList.innerHTML = sessions.map(session => {
            const isSelected = this.selectedSession && this.selectedSession.sessionId === session.sessionId;
            const progress = qualityUtils.calculateSessionProgress(session);

            return `
                <div class="user-card ${isSelected ? 'selected' : ''}" 
                     data-session-id="${session.sessionId}" 
                     data-user-id="${session.userId}">
                    <div class="user-main">
                        <div class="user-avatar">${session.userName.charAt(0).toUpperCase()}</div>
                        <div class="user-info">
                            <div class="user-name">${session.userName}</div>
                            <div class="user-department">Qualitätskontrolle</div>
                            <div class="user-timer">${qualityUtils.formatDuration(session.duration || 0)}</div>
                            <div class="user-scans">
                                📦 ${session.totalScans || 0} Scans
                                ${progress ? `(✅ ${progress.completed} abgeschlossen, 🔄 ${progress.inProgress} laufend)` : ''}
                            </div>
                        </div>
                    </div>
                    <div class="user-actions">
                        <button class="btn-icon" onclick="app.selectSession(${session.sessionId})" title="Für QR-Scanning auswählen">
                            📸
                        </button>
                        <button class="btn-icon" onclick="app.endSession(${session.sessionId})" title="Session beenden">
                            🚪
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Event-Listener für User-Cards hinzufügen
        this.usersList.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (!e.target.classList.contains('btn-icon')) {
                    const sessionId = parseInt(card.dataset.sessionId);
                    this.selectSession(sessionId);
                }
            });
        });
    }

    throttledUpdateSessionsDisplay() {
        const now = Date.now();
        if (now - this.lastUIUpdate > this.uiUpdateThrottle) {
            this.updateSessionsDisplay();
            this.lastUIUpdate = now;
        }
    }

    updateWorkspaceVisibility() {
        const hasActiveSessions = this.activeSessions.size > 0;

        if (hasActiveSessions) {
            this.loginSection.style.display = 'none';
            this.workspaceSection.style.display = 'block';
        } else {
            this.loginSection.style.display = 'block';
            this.workspaceSection.style.display = 'none';
            this.stopQRScanner(); // Scanner stoppen wenn keine Sessions
        }
    }

    // ===== SESSION SELECTION =====
    selectSession(sessionId) {
        console.log(`👤 Session auswählen: ${sessionId}`);

        // Session in activeSessions finden
        let selectedSession = null;
        for (const [userId, session] of this.activeSessions.entries()) {
            if (session.sessionId === sessionId) {
                selectedSession = session;
                break;
            }
        }

        if (!selectedSession) {
            console.error('❌ Session nicht gefunden:', sessionId);
            return;
        }

        this.selectedSession = selectedSession;

        // UI aktualisieren
        this.updateSessionsDisplay();
        this.updateSelectedUserPanel();

        // Notification
        this.showNotification('info', 'Session ausgewählt', `${selectedSession.userName} für QR-Scanning bereit`);
    }

    updateSelectedUserPanel() {
        if (!this.selectedUserPanel) return;

        if (!this.selectedSession) {
            this.selectedUserPanel.innerHTML = `
                <div class="no-selection">
                    <div class="selection-icon">👤</div>
                    <h3>Benutzer auswählen</h3>
                    <p>Wählen Sie einen Benutzer für das QR-Code-Scanning aus</p>
                </div>
            `;
            return;
        }

        const session = this.selectedSession;
        const progress = qualityUtils.calculateSessionProgress(session);

        this.selectedUserPanel.innerHTML = `
            <div class="user-info">
                <div class="user-avatar">${session.userName.charAt(0).toUpperCase()}</div>
                <div class="user-details">
                    <div class="user-name">${session.userName}</div>
                    <div class="user-session-info">
                        <span class="session-time">${qualityUtils.formatDuration(session.duration || 0)}</span>
                        <span>📦 ${session.totalScans || 0} Scans</span>
                        ${progress ? `<span>✅ ${progress.completed} abgeschlossen</span>` : ''}
                    </div>
                </div>
                <div class="user-actions">
                    <button class="logout-btn" onclick="app.endSession(${session.sessionId})">
                        🚪 Session beenden
                    </button>
                </div>
            </div>
        `;
    }

    async endSession(sessionId) {
        try {
            console.log(`🔚 Session beenden: ${sessionId}`);

            const result = await window.electronAPI.session.end(sessionId);

            if (result.success) {
                console.log('✅ Session erfolgreich beendet');
            } else {
                console.error('❌ Session beenden fehlgeschlagen:', result.error);
                this.showErrorModal('Session beenden fehlgeschlagen', result.error);
            }

        } catch (error) {
            console.error('❌ Session beenden Fehler:', error);
            this.showErrorModal('Session beenden fehlgeschlagen', error.message);
        }
    }

    // ===== RFID HANDLING =====
    async handleRFIDInput(tagId) {
        try {
            console.log(`🏷️ RFID-Tag verarbeiten: ${tagId}`);

            const result = await window.electronAPI.rfid.simulateTag(tagId);

            if (result.success) {
                console.log('✅ RFID-Login erfolgreich');
                this.playSuccessSound();
            } else {
                console.error('❌ RFID-Login fehlgeschlagen:', result.error);

                const errorInfo = window.errorHandler.handleRFIDError(result, tagId);
                this.showNotification('error', errorInfo.title, errorInfo.suggestion);
            }

        } catch (error) {
            console.error('❌ RFID-Verarbeitung fehlgeschlagen:', error);
            const errorInfo = window.errorHandler.handleRFIDError(error, tagId);
            this.showNotification('error', errorInfo.title, errorInfo.suggestion);
        }
    }

    // ===== QR-CODE SCANNER =====
    async startQRScanner() {
        if (!this.selectedSession) {
            this.showNotification('warning', 'Keine Session ausgewählt', 'Wählen Sie zuerst einen Benutzer aus');
            return;
        }

        try {
            console.log('📸 Starte QR-Scanner...');

            // Kamera-Zugriff anfragen
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment' // Rückkamera bevorzugen
                }
            });

            this.qrScanner.stream = stream;
            this.qrScanner.video = this.qrVideo;
            this.qrScanner.canvas = this.scannerCanvas;
            this.qrScanner.context = this.scannerCanvas.getContext('2d');

            // Video-Element konfigurieren
            this.qrVideo.srcObject = stream;
            this.qrVideo.play();

            this.qrScanner.active = true;

            // UI aktualisieren
            this.updateScannerUI();

            // Scan-Loop starten
            this.startScanLoop();

            console.log('✅ QR-Scanner gestartet');

        } catch (error) {
            console.error('❌ QR-Scanner starten fehlgeschlagen:', error);
            this.showErrorModal('Kamera-Fehler', 'Kamera-Zugriff fehlgeschlagen. Prüfen Sie die Berechtigungen.');
        }
    }

    stopQRScanner() {
        console.log('🛑 Stoppe QR-Scanner...');

        this.qrScanner.active = false;

        // Animation stoppen
        if (this.qrScanner.animationFrame) {
            cancelAnimationFrame(this.qrScanner.animationFrame);
            this.qrScanner.animationFrame = null;
        }

        // Stream stoppen
        if (this.qrScanner.stream) {
            this.qrScanner.stream.getTracks().forEach(track => track.stop());
            this.qrScanner.stream = null;
        }

        // Video zurücksetzen
        if (this.qrVideo) {
            this.qrVideo.srcObject = null;
        }

        // UI aktualisieren
        this.updateScannerUI();

        console.log('✅ QR-Scanner gestoppt');
    }

    startScanLoop() {
        const scanFrame = () => {
            if (!this.qrScanner.active) return;

            try {
                // Video-Frame auf Canvas zeichnen
                if (this.qrVideo.readyState === this.qrVideo.HAVE_ENOUGH_DATA) {
                    const canvas = this.qrScanner.canvas;
                    const context = this.qrScanner.context;
                    const video = this.qrVideo;

                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);

                    // QR-Code suchen
                    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                    const code = jsQR(imageData.data, imageData.width, imageData.height);

                    if (code) {
                        this.handleQRCodeDetected(code.data);
                    }
                }

            } catch (error) {
                console.warn('⚠️ Scan-Frame Fehler:', error);
            }

            // Nächsten Frame anfordern
            this.qrScanner.animationFrame = requestAnimationFrame(scanFrame);
        };

        scanFrame();
    }

    async handleQRCodeDetected(qrData) {
        // Rate-Limiting
        const now = Date.now();
        if (now - this.lastScanTime < this.scanCooldown) {
            return;
        }
        this.lastScanTime = now;

        console.log(`📸 QR-Code erkannt: ${qrData.substring(0, 50)}...`);

        // Performance-Tracking
        const scanTimer = utils.performanceTimer();

        try {
            // QR-Code an Backend senden
            const result = await window.electronAPI.qr.scan(qrData, this.selectedSession.sessionId);

            if (result.success) {
                // Erfolg verarbeiten
                await this.handleQRScanSuccess(result);

                // Audio-Feedback
                this.playSuccessSound();

            } else {
                // Fehler verarbeiten
                this.handleQRScanError(result);

                // Error-Sound
                this.playErrorSound();
            }

            // Performance-Metriken aktualisieren
            const scanTime = scanTimer.elapsed();
            this.updatePerformanceMetrics(scanTime);

        } catch (error) {
            console.error('❌ QR-Scan Verarbeitung fehlgeschlagen:', error);

            const errorInfo = window.errorHandler.handleQRScanError(error, qrData);
            this.showNotification('error', errorInfo.title, errorInfo.suggestion);

            this.playErrorSound();
        }
    }

    async handleQRScanSuccess(result) {
        console.log('✅ QR-Scan erfolgreich:', result);

        // Session-Statistiken aktualisieren
        if (this.selectedSession && result.sessionStats) {
            this.selectedSession.firstScans = result.sessionStats.firstScans || 0;
            this.selectedSession.completedScans = result.sessionStats.completedScans || 0;
            this.selectedSession.totalScans = this.selectedSession.firstScans + this.selectedSession.completedScans;
        }

        // Scan-Historie aktualisieren
        this.addToScanHistory(result);

        // UI aktualisieren
        this.updateSessionsDisplay();
        this.updateSelectedUserPanel();

        // Spezielle Behandlung für verschiedene Scan-Typen
        const scanInfo = qualityUtils.formatScanType(result.scanType);

        if (result.scanType === 'first_scan') {
            this.showNotification('info', scanInfo.title, scanInfo.nextAction, 3000);

        } else if (result.scanType === 'second_scan') {
            // Session wurde automatisch beendet - spezielle Behandlung
            this.showNotification('success', '🎯 Qualitätskontrolle abgeschlossen!', 'Neue Session automatisch gestartet', 4000);

            // Scanner-Overlay kurz anzeigen
            this.showScanSuccessOverlay();

            // Session-Daten aktualisieren (neue Session wurde gestartet)
            if (result.newSession && result.newSession.newSessionStarted) {
                setTimeout(() => {
                    this.loadActiveSessions();
                }, 1000);
            }
        }

        // Dekodierte Daten anzeigen (falls verfügbar)
        if (result.decodedData && result.decodedData.hasData) {
            this.showDecodedDataInfo(result.decodedData);
        }
    }

    handleQRScanError(result) {
        console.error('❌ QR-Scan Fehler:', result);

        const errorInfo = window.errorHandler.handleQRScanError(result, result.qrData);

        // Spezielle Behandlung für Duplikat-Fehler
        if (errorInfo.type === 'duplicate') {
            this.showNotification('error', '❌ Duplikat-Fehler', 'Karton bereits vollständig abgearbeitet!', 4000);
            this.showScanErrorOverlay('Karton bereits abgearbeitet');
        } else {
            this.showNotification('error', errorInfo.title, errorInfo.suggestion, 3000);
        }
    }

    addToScanHistory(scanResult) {
        if (!this.scanHistoryList) return;

        const scanInfo = qualityUtils.formatScanType(scanResult.scanType);
        const decodedInfo = qualityUtils.formatDecodedData(scanResult.decodedData);

        const historyItem = document.createElement('div');
        historyItem.className = 'scan-history-item';
        historyItem.innerHTML = `
            <div class="scan-header">
                <span class="scan-icon">${scanInfo.icon}</span>
                <span class="scan-type">${scanInfo.title}</span>
                <span class="scan-time">${qualityUtils.getCurrentTime()}</span>
            </div>
            <div class="scan-content">
                <div class="scan-message">${scanResult.message}</div>
                ${decodedInfo.hasData ? `
                    <div class="decoded-data">
                        ${decodedInfo.fields.map(field => `
                            <span class="field field-${field.type}">
                                ${field.icon} ${field.label}: ${field.value}
                            </span>
                        `).join('')}
                    </div>
                ` : ''}
                ${scanResult.processingTime ? `
                    <div class="processing-time">
                        ⏱️ Bearbeitungszeit: ${qualityUtils.formatProcessingTime(scanResult.processingTime)}
                    </div>
                ` : ''}
            </div>
        `;

        // Am Anfang der Liste einfügen
        this.scanHistoryList.insertBefore(historyItem, this.scanHistoryList.firstChild);

        // Historie auf max. 10 Einträge begrenzen
        while (this.scanHistoryList.children.length > 10) {
            this.scanHistoryList.removeChild(this.scanHistoryList.lastChild);
        }

        // Container sichtbar machen
        if (this.scanHistoryContainer) {
            this.scanHistoryContainer.style.display = 'block';
        }
    }

    showScanSuccessOverlay() {
        const overlay = document.createElement('div');
        overlay.className = 'scan-success-overlay';
        overlay.innerHTML = `
            <div class="success-content">
                <div class="success-icon">✅</div>
                <div class="success-message">Qualitätskontrolle abgeschlossen!</div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Overlay nach 2 Sekunden entfernen
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 2000);
    }

    showScanErrorOverlay(message) {
        const overlay = document.createElement('div');
        overlay.className = 'scan-error-overlay';
        overlay.innerHTML = `
            <div class="error-content">
                <div class="error-icon">❌</div>
                <div class="error-message">${message}</div>
            </div>
        `;

        document.body.appendChild(overlay);

        // Overlay nach 3 Sekunden entfernen
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 3000);
    }

    showDecodedDataInfo(decodedData) {
        if (!decodedData.hasData) return;

        const info = document.createElement('div');
        info.className = 'decoded-data-info';
        info.innerHTML = `
            <div class="decoded-header">📋 ${decodedData.summary}</div>
            <div class="decoded-fields">
                ${decodedData.fields.map(field => `
                    <span class="decoded-field field-${field.type}">
                        ${field.icon} ${field.label}: ${field.value}
                    </span>
                `).join('')}
            </div>
        `;

        // Info in Scanner-Bereich anzeigen
        if (this.scannerStatus) {
            this.scannerStatus.appendChild(info);

            // Nach 5 Sekunden entfernen
            setTimeout(() => {
                if (info.parentNode) {
                    info.remove();
                }
            }, 5000);
        }
    }

    updateScannerUI() {
        if (!this.startScannerBtn || !this.stopScannerBtn || !this.scannerStatus) return;

        if (this.qrScanner.active) {
            this.startScannerBtn.style.display = 'none';
            this.stopScannerBtn.style.display = 'inline-flex';
            this.scannerStatus.innerHTML = `
                <div class="scanner-active">
                    <div class="pulse-dot"></div>
                    QR-Scanner aktiv - halten Sie QR-Codes vor die Kamera
                </div>
            `;
        } else {
            this.startScannerBtn.style.display = 'inline-flex';
            this.stopScannerBtn.style.display = 'none';
            this.scannerStatus.innerHTML = `
                <div class="scanner-inactive">
                    📸 Scanner bereit - klicken Sie "Scanner starten"
                </div>
            `;
        }
    }

    // ===== PERFORMANCE & STATISTICS =====
    updatePerformanceMetrics(scanTime) {
        this.performanceMetrics.scanCount++;
        this.performanceMetrics.lastScanTimes.push(scanTime);

        // Nur die letzten 50 Scan-Zeiten behalten
        if (this.performanceMetrics.lastScanTimes.length > 50) {
            this.performanceMetrics.lastScanTimes.shift();
        }

        // Durchschnitt berechnen
        const sum = this.performanceMetrics.lastScanTimes.reduce((a, b) => a + b, 0);
        this.performanceMetrics.averageScanTime = sum / this.performanceMetrics.lastScanTimes.length;
    }

    updateGlobalStats(data) {
        if (data.decodingStats) {
            this.globalStats.decodingStats = data.decodingStats;
        }

        this.globalStats.activeSessionCount = data.activeSessionCount || 0;
        this.globalStats.completedQRCodes = data.completedQRCodes || 0;

        // Statistiken-UI aktualisieren
        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        if (!this.globalStatsContainer) return;

        const stats = this.globalStats.decodingStats;
        const successRate = stats.totalScans > 0 ? Math.round((stats.successfulDecodes / stats.totalScans) * 100) : 0;

        this.globalStatsContainer.innerHTML = `
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-value">${this.globalStats.activeSessionCount}</div>
                    <div class="stat-label">Aktive Sessions</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${stats.totalScans}</div>
                    <div class="stat-label">Gesamt-Scans</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${this.globalStats.completedQRCodes}</div>
                    <div class="stat-label">Abgeschlossen</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${successRate}%</div>
                    <div class="stat-label">Erfolgsrate</div>
                </div>
            </div>
        `;
    }

    // ===== AUDIO FEEDBACK =====
    playSuccessSound() {
        if (!this.audioEnabled || !this.audioContext) return;

        try {
            // Kurzer, angenehmer Erfolgs-Ton
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime);
            oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.2);

        } catch (error) {
            console.warn('⚠️ Audio-Feedback fehlgeschlagen:', error);
        }
    }

    playErrorSound() {
        if (!this.audioEnabled || !this.audioContext) return;

        try {
            // Kurzer, tiefer Fehler-Ton
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            oscillator.frequency.setValueAtTime(300, this.audioContext.currentTime);
            oscillator.type = 'square';

            gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);

            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.3);

        } catch (error) {
            console.warn('⚠️ Audio-Feedback fehlgeschlagen:', error);
        }
    }

    // ===== NOTIFICATIONS =====
    showNotification(type, title, message, duration = 3000) {
        const notifications = document.getElementById('notifications') || this.createNotificationsContainer();

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        notification.innerHTML = `
            <div class="notification-icon">${icons[type] || 'ℹ️'}</div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-text">${message}</div>
            </div>
        `;

        notifications.appendChild(notification);

        // Auto-Remove
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    createNotificationsContainer() {
        const container = document.createElement('div');
        container.id = 'notifications';
        container.className = 'notifications-container';
        document.body.appendChild(container);
        return container;
    }

    showErrorModal(title, message) {
        const modal = document.getElementById('errorModal');
        const titleElement = document.querySelector('#errorModal .modal-title .icon');
        const messageElement = document.getElementById('errorMessage');

        titleElement.nextSibling.textContent = title;
        messageElement.textContent = message;

        this.showModal('errorModal');
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('show');
    }

    hideModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.remove('show');
    }

    // ===== DEBUG-FUNKTIONEN FÜR ENTWICKLERKONSOLE =====

    // Für Entwicklerkonsole - Session-Status prüfen
    async debugSessionStatus() {
        const activeSessions = await window.electronAPI.session.getAllActive();
        const systemStatus = await window.electronAPI.system.getStatus();

        console.log('=== QUALITÄTSKONTROLLE DEBUG INFO ===');
        console.log('Frontend Active Sessions:', this.activeSessions);
        console.log('Backend Active Sessions:', activeSessions);
        console.log('System Status:', systemStatus);
        console.log('Session Timers:', this.sessionTimers);
        console.log('Selected Session:', this.selectedSession);
        console.log('QR Scanner Status:', this.qrScanner);
    }

    // Für Entwicklerkonsole - RFID simulieren
    async simulateRFID(tagId) {
        console.log(`🧪 Simuliere RFID-Tag: ${tagId}`);
        const result = await window.electronAPI.rfid.simulateTag(tagId);
        console.log('Simulation Ergebnis:', result);
        return result;
    }

    // Für Entwicklerkonsole - QR-Code simulieren
    async simulateQRScan(qrData) {
        if (!this.selectedSession) {
            console.error('❌ Keine Session ausgewählt');
            return { success: false, error: 'Keine Session ausgewählt' };
        }

        console.log(`🧪 Simuliere QR-Scan: ${qrData}`);
        const result = await window.electronAPI.qr.scan(qrData, this.selectedSession.sessionId);
        console.log('Simulation Ergebnis:', result);

        if (result.success) {
            await this.handleQRScanSuccess(result);
        } else {
            this.handleQRScanError(result);
        }

        return result;
    }

    // Für Entwicklerkonsole - Performance-Statistiken
    getPerformanceStats() {
        return {
            ...this.performanceMetrics,
            activeSessionCount: this.activeSessions.size,
            scannerActive: this.qrScanner.active,
            audioEnabled: this.audioEnabled,
            systemStatus: this.systemStatus
        };
    }
}

// ===== APP INITIALIZATION =====
let app;

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎯 Qualitätskontrolle-Frontend wird geladen...');

    try {
        // App-Instanz erstellen
        app = new QualitaetskontrolleApp();

        // Global verfügbar machen für Console-Debugging
        window.app = app;

        // App initialisieren
        await app.initialize();

        // jsQR-Library laden
        if (typeof jsQR === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
            script.onload = () => {
                console.log('✅ jsQR-Library geladen');
            };
            script.onerror = () => {
                console.error('❌ jsQR-Library laden fehlgeschlagen');
            };
            document.head.appendChild(script);
        }

        console.log('✅ Qualitätskontrolle-Frontend erfolgreich geladen');

    } catch (error) {
        console.error('❌ Frontend-Initialisierung fehlgeschlagen:', error);

        // Fallback-UI anzeigen
        document.body.innerHTML = `
            <div class="error-fallback">
                <h1>❌ Initialisierung fehlgeschlagen</h1>
                <p>Die Anwendung konnte nicht gestartet werden:</p>
                <pre>${error.message}</pre>
                <button onclick="location.reload()">🔄 Neu laden</button>
            </div>
        `;
    }
});

// ===== GLOBAL ERROR HANDLING =====
window.addEventListener('error', (event) => {
    console.error('💥 Global Error:', event.error);
    if (window.app) {
        window.app.showNotification('error', 'Anwendungsfehler', 'Ein unerwarteter Fehler ist aufgetreten');
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('💥 Unhandled Promise Rejection:', event.reason);
    if (window.app) {
        window.app.showNotification('error', 'Promise-Fehler', 'Ein asynchroner Fehler ist aufgetreten');
    }
});

console.log('🎯 Qualitätskontrolle Frontend-Script geladen');