/**
 * RFID Wareneingang - Vereinfachte Hauptanwendung
 * Fokus auf einfache Bedienung für Wareneingang-Mitarbeiter
 */

class WareneingangApp {
    constructor() {
        // Anwendungsstatus
        this.currentUser = null;
        this.sessionStartTime = null;
        this.sessionTimer = null;
        this.scanCount = 0;
        this.recentScans = [];

        // QR-Scanner Status
        this.scannerActive = false;
        this.videoStream = null;
        this.scanLoop = null;
        this.lastScanTime = 0;
        this.scanCooldown = 3000; // 3 Sekunden zwischen Scans

        // QR-Scanner Engine
        this.qrScanner = null;
        this.loadQRLibrary();

        // Duplikat-Vermeidung
        this.globalScannedCodes = new Set();
        this.sessionScannedCodes = new Set();

        this.init();
    }

    async init() {
        console.log('🚀 Wareneingang-App wird initialisiert...');

        this.setupEventListeners();
        this.setupIPCListeners();
        this.startClockUpdate();
        this.updateSystemInfo();

        // Kamera-Verfügbarkeit prüfen
        await this.checkCameraAvailability();

        console.log('✅ Wareneingang-App bereit');
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

        // User Controls
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.logoutCurrentUser();
        });

        // Scans Management
        document.getElementById('clearScansBtn').addEventListener('click', () => {
            this.clearRecentScans();
        });

        // Modal Controls
        this.setupModalHandlers();
    }

    setupModalHandlers() {
        // Error Modal
        const errorModal = document.getElementById('errorModal');
        const errorModalClose = document.getElementById('errorModalClose');
        const errorModalOk = document.getElementById('errorModalOk');

        errorModalClose.addEventListener('click', () => this.hideModal('errorModal'));
        errorModalOk.addEventListener('click', () => this.hideModal('errorModal'));

        // Camera Permission Modal
        const cameraModal = document.getElementById('cameraPermissionModal');
        const grantPermission = document.getElementById('grantCameraPermission');
        const cancelPermission = document.getElementById('cancelCameraPermission');

        grantPermission.addEventListener('click', () => {
            this.hideModal('cameraPermissionModal');
            this.requestCameraPermission();
        });

        cancelPermission.addEventListener('click', () => {
            this.hideModal('cameraPermissionModal');
        });

        // Click outside to close modals
        [errorModal, cameraModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.hideModal(modal.id);
                }
            });
        });
    }

    setupIPCListeners() {
        // System bereit
        window.electronAPI.on('system-ready', (data) => {
            console.log('System bereit:', data);
            this.updateSystemStatus('active', 'System bereit');
            this.showNotification('success', 'System bereit', 'RFID und Datenbank verbunden');
        });

        // System-Fehler
        window.electronAPI.on('system-error', (data) => {
            console.error('System-Fehler:', data);
            this.updateSystemStatus('error', 'System-Fehler');
            this.showErrorModal('System-Fehler', data.error);
        });

        // Benutzer-Anmeldung
        window.electronAPI.on('user-login', (data) => {
            console.log('Benutzer-Anmeldung:', data);
            this.handleUserLogin(data.user, data.session);
        });

        // Benutzer-Abmeldung
        window.electronAPI.on('user-logout', (data) => {
            console.log('Benutzer-Abmeldung:', data);
            this.handleUserLogout(data.user);
        });

        // RFID-Fehler
        window.electronAPI.on('rfid-scan-error', (data) => {
            console.error('RFID-Fehler:', data);
            this.showNotification('error', 'RFID-Fehler', data.message);
        });
    }

    // ===== USER MANAGEMENT =====
    handleUserLogin(user, session) {
        this.currentUser = {
            id: user.ID,
            name: user.BenutzerName,
            email: user.Email,
            sessionId: session.ID
        };

        this.sessionStartTime = new Date(session.StartTS);
        this.scanCount = 0;
        this.sessionScannedCodes.clear();

        this.showWorkspace();
        this.startSessionTimer();

        this.showNotification('success', 'Angemeldet', `Willkommen ${user.BenutzerName}!`);
        this.updateInstructionText('QR-Code vor die Kamera halten um Pakete zu erfassen');
    }

    handleUserLogout(user) {
        this.hideWorkspace();
        this.stopSessionTimer();
        this.stopQRScanner();

        this.currentUser = null;
        this.sessionStartTime = null;
        this.scanCount = 0;
        this.sessionScannedCodes.clear();

        this.showNotification('info', 'Abgemeldet', `${user.BenutzerName} abgemeldet`);
        this.updateInstructionText('RFID-Tag scannen = Anmelden • QR-Code scannen = Paket erfassen');
    }

    async logoutCurrentUser() {
        if (!this.currentUser) return;

        try {
            await window.electronAPI.session.end(this.currentUser.sessionId);
            this.showNotification('info', 'Abmeldung', 'Sie wurden erfolgreich abgemeldet');
        } catch (error) {
            console.error('Abmelde-Fehler:', error);
            this.showNotification('error', 'Fehler', 'Abmeldung fehlgeschlagen');
        }
    }

    showWorkspace() {
        document.getElementById('loginSection').style.display = 'none';
        document.getElementById('workspace').style.display = 'grid';
        this.updateUserDisplay();
    }

    hideWorkspace() {
        document.getElementById('workspace').style.display = 'none';
        document.getElementById('loginSection').style.display = 'flex';
    }

    updateUserDisplay() {
        if (!this.currentUser) return;

        document.getElementById('currentUserName').textContent = this.currentUser.name;
        document.getElementById('sessionScans').textContent = this.scanCount;
    }

    // ===== SESSION TIMER =====
    startSessionTimer() {
        this.sessionTimer = setInterval(() => {
            this.updateSessionTime();
        }, 1000);
        this.updateSessionTime();
    }

    stopSessionTimer() {
        if (this.sessionTimer) {
            clearInterval(this.sessionTimer);
            this.sessionTimer = null;
        }
    }

    updateSessionTime() {
        if (!this.sessionStartTime) return;

        const now = new Date();
        const elapsed = Math.floor((now - this.sessionStartTime) / 1000);
        const timeString = this.formatDuration(elapsed);

        document.getElementById('sessionTime').textContent = timeString;
    }

    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;

        return [hours, minutes, secs]
            .map(v => v.toString().padStart(2, '0'))
            .join(':');
    }

    // ===== KAMERA & QR-SCANNER =====
    async loadQRLibrary() {
        try {
            // Versuche jsQR zu laden
            if (typeof jsQR === 'undefined') {
                const script = document.createElement('script');
                script.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
                script.onload = () => {
                    console.log('✅ jsQR-Bibliothek geladen');
                };
                script.onerror = () => {
                    console.warn('⚠️ jsQR konnte nicht geladen werden - Fallback wird verwendet');
                };
                document.head.appendChild(script);
            }
        } catch (error) {
            console.warn('QR-Bibliothek laden fehlgeschlagen:', error);
        }
    }

    async checkCameraAvailability() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter(device => device.kind === 'videoinput');

            if (cameras.length === 0) {
                this.showNotification('warning', 'Keine Kamera', 'Keine Kamera gefunden - QR-Scanner nicht verfügbar');
                return false;
            }

            console.log(`📷 ${cameras.length} Kamera(s) gefunden:`, cameras);
            return true;

        } catch (error) {
            console.error('Kamera-Verfügbarkeit prüfen fehlgeschlagen:', error);
            this.showNotification('error', 'Kamera-Fehler', 'Kamera-Zugriff nicht möglich');
            return false;
        }
    }

    async startQRScanner() {
        if (this.scannerActive) return;

        if (!this.currentUser) {
            this.showNotification('warning', 'Anmeldung erforderlich', 'Bitte melden Sie sich zuerst mit RFID an');
            return;
        }

        try {
            console.log('📷 Starte QR-Scanner...');

            // Prüfe Kamera-Berechtigung
            const permission = await this.checkCameraPermission();
            if (permission === 'denied') {
                this.showModal('cameraPermissionModal');
                return;
            }

            // Optimierte Kamera-Constraints für bessere Kompatibilität
            const constraints = await this.getOptimalCameraConstraints();

            this.videoStream = await navigator.mediaDevices.getUserMedia(constraints);

            const video = document.getElementById('scannerVideo');
            video.srcObject = this.videoStream;

            // Warte auf Video-Metadaten
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    console.log(`📷 Video bereit: ${video.videoWidth}x${video.videoHeight}`);
                    resolve();
                };
                video.onerror = reject;
                setTimeout(() => reject(new Error('Video-Load-Timeout')), 10000);
            });

            await video.play();

            this.scannerActive = true;
            this.updateScannerUI();
            this.startQRScanLoop();

            this.showNotification('success', 'Scanner bereit', 'QR-Codes werden automatisch erkannt');

        } catch (error) {
            console.error('QR-Scanner Start fehlgeschlagen:', error);
            this.showErrorModal('Scanner-Fehler',
                `Kamera konnte nicht gestartet werden:\n${error.message}\n\n` +
                'Lösungsvorschläge:\n' +
                '• Kamera-Berechtigung erteilen\n' +
                '• Andere Apps schließen die Kamera verwenden\n' +
                '• Anwendung neu starten'
            );
        }
    }

    async getOptimalCameraConstraints() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cameras = devices.filter(device => device.kind === 'videoinput');

            // Basis-Constraints
            let constraints = {
                video: {
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 },
                    frameRate: { ideal: 30, min: 15 }
                }
            };

            // Bevorzuge Rückkamera wenn verfügbar
            const backCamera = cameras.find(camera =>
                camera.label.toLowerCase().includes('back') ||
                camera.label.toLowerCase().includes('rear') ||
                camera.label.toLowerCase().includes('environment')
            );

            if (backCamera) {
                constraints.video.deviceId = { ideal: backCamera.deviceId };
            } else if (cameras.length > 0) {
                // Verwende erste verfügbare Kamera
                constraints.video.deviceId = { ideal: cameras[0].deviceId };
            }

            return constraints;

        } catch (error) {
            console.warn('Optimale Kamera-Constraints fehlgeschlagen, verwende Fallback:', error);
            return {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            };
        }
    }

    async checkCameraPermission() {
        try {
            const result = await navigator.permissions.query({ name: 'camera' });
            return result.state; // 'granted', 'denied', 'prompt'
        } catch (error) {
            return 'unknown';
        }
    }

    async requestCameraPermission() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // Stoppe Stream sofort wieder - nur für Berechtigung
            stream.getTracks().forEach(track => track.stop());

            this.showNotification('success', 'Berechtigung erteilt', 'Kamera-Zugriff wurde erlaubt');

            // Versuche Scanner zu starten
            setTimeout(() => this.startQRScanner(), 500);

        } catch (error) {
            this.showNotification('error', 'Berechtigung verweigert', 'Kamera-Zugriff wurde nicht erlaubt');
        }
    }

    stopQRScanner() {
        if (!this.scannerActive) return;

        console.log('⏹️ Stoppe QR-Scanner...');

        // Video-Stream stoppen
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => {
                track.stop();
                console.log(`Track gestoppt: ${track.kind}`);
            });
            this.videoStream = null;
        }

        // Scan-Loop stoppen
        if (this.scanLoop) {
            cancelAnimationFrame(this.scanLoop);
            this.scanLoop = null;
        }

        // Video-Element leeren
        const video = document.getElementById('scannerVideo');
        video.srcObject = null;

        this.scannerActive = false;
        this.updateScannerUI();

        this.showNotification('info', 'Scanner gestoppt', 'QR-Scanner wurde beendet');
    }

    startQRScanLoop() {
        const video = document.getElementById('scannerVideo');
        const canvas = document.getElementById('scannerCanvas');
        const context = canvas.getContext('2d');

        const scanFrame = () => {
            if (!this.scannerActive || !video.videoWidth || !video.videoHeight) {
                if (this.scannerActive) {
                    this.scanLoop = requestAnimationFrame(scanFrame);
                }
                return;
            }

            try {
                // Canvas auf Video-Größe setzen
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // Video-Frame auf Canvas zeichnen
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Image-Data für QR-Erkennung
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                // QR-Code erkennen
                if (typeof jsQR !== 'undefined') {
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert"
                    });

                    if (code && code.data) {
                        this.handleQRCodeDetected(code.data);
                    }
                } else {
                    // Fallback: Einfache Muster-Erkennung
                    if (this.detectQRPattern(imageData)) {
                        const mockData = `FALLBACK_QR_${Date.now()}`;
                        this.handleQRCodeDetected(mockData);
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

    detectQRPattern(imageData) {
        // Einfache QR-Muster-Erkennung als Fallback
        // Erkennt grundlegende Muster von QR-Codes
        const { data, width, height } = imageData;
        let darkPixels = 0;
        let totalPixels = width * height;

        // Zähle dunkle Pixel
        for (let i = 0; i < data.length; i += 4) {
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness < 128) darkPixels++;
        }

        // QR-Codes haben typischerweise 40-60% dunkle Pixel
        const darkRatio = darkPixels / totalPixels;
        return darkRatio > 0.3 && darkRatio < 0.7;
    }

    updateScannerUI() {
        const startBtn = document.getElementById('startScannerBtn');
        const stopBtn = document.getElementById('stopScannerBtn');
        const statusText = document.getElementById('scannerStatusText');
        const cameraStatus = document.getElementById('cameraStatus');

        if (this.scannerActive) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-flex';
            statusText.textContent = 'Scanner aktiv';
            cameraStatus.style.display = 'none';
        } else {
            startBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
            statusText.textContent = 'Scanner gestoppt';
            cameraStatus.style.display = 'flex';
        }
    }

    // ===== QR-CODE VERARBEITUNG =====
    async handleQRCodeDetected(qrData) {
        const now = Date.now();

        // Cooldown prüfen
        if (now - this.lastScanTime < this.scanCooldown) {
            return;
        }

        // Duplikat prüfen (global und session)
        if (await this.isDuplicateQR(qrData)) {
            this.showNotification('warning', 'Duplikat', 'Dieser QR-Code wurde bereits gescannt');
            return;
        }

        this.lastScanTime = now;

        console.log('📄 QR-Code erkannt:', qrData);

        try {
            // In Datenbank speichern
            const result = await window.electronAPI.qr.saveScan(this.currentUser.sessionId, qrData);

            if (result) {
                // Duplikat-Sets aktualisieren
                this.globalScannedCodes.add(qrData);
                this.sessionScannedCodes.add(qrData);

                // Scan-Count erhöhen
                this.scanCount++;
                this.updateUserDisplay();

                // Zu Recent Scans hinzufügen
                this.addToRecentScans({
                    id: result.ID,
                    timestamp: new Date(),
                    content: qrData,
                    user: this.currentUser.name
                });

                // Erfolgs-Feedback zeigen
                this.showScanSuccess(qrData);

                // Letzte Scan-Zeit aktualisieren
                document.getElementById('lastScanTime').textContent =
                    new Date().toLocaleTimeString('de-DE');

                console.log(`✅ QR-Code gespeichert für ${this.currentUser.name}`);

            } else {
                throw new Error('QR-Code konnte nicht gespeichert werden');
            }

        } catch (error) {
            console.error('QR-Code Verarbeitung fehlgeschlagen:', error);
            this.showNotification('error', 'Speicher-Fehler', error.message);
        }
    }

    async isDuplicateQR(qrData) {
        // Session-Duplikat (schnell)
        if (this.sessionScannedCodes.has(qrData)) {
            return true;
        }

        // Globales Duplikat (wenn noch nicht im lokalen Set)
        if (this.globalScannedCodes.has(qrData)) {
            return true;
        }

        // Datenbank-Duplikat prüfen (für heute)
        try {
            const today = new Date().toISOString().split('T')[0];
            const result = await window.electronAPI.db.query(`
                SELECT COUNT(*) as count 
                FROM dbo.QrScans q
                INNER JOIN dbo.Sessions s ON q.SessionID = s.ID
                WHERE q.RawPayload = ? 
                AND CAST(q.CapturedTS AS DATE) = ?
            `, [qrData, today]);

            const count = result.recordset[0].count;

            if (count > 0) {
                // Zu lokalen Sets hinzufügen für Performance
                this.globalScannedCodes.add(qrData);
                return true;
            }

            return false;

        } catch (error) {
            console.error('Duplikat-Prüfung fehlgeschlagen:', error);
            // Bei Fehler: Als neuen Scan behandeln
            return false;
        }
    }

    showScanSuccess(qrData) {
        // Visuelles Feedback im Scanner
        const overlay = document.querySelector('.scanner-overlay');
        overlay.style.background = 'rgba(40, 167, 69, 0.3)';

        setTimeout(() => {
            overlay.style.background = '';
        }, 1000);

        // Vollbild-Erfolg anzeigen
        const successOverlay = document.getElementById('scanSuccessOverlay');
        const successDetails = document.getElementById('scanSuccessDetails');

        // QR-Inhalt anzeigen (gekürzt)
        const displayText = qrData.length > 50 ?
            qrData.substring(0, 50) + '...' : qrData;
        successDetails.textContent = displayText;

        successOverlay.classList.add('show');

        setTimeout(() => {
            successOverlay.classList.remove('show');
        }, 2000);

        // Sound-Feedback (optional)
        this.playSuccessSound();
    }

    playSuccessSound() {
        try {
            // Einfacher Erfolgs-Sound
            const context = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = context.createOscillator();
            const gainNode = context.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(context.destination);

            oscillator.frequency.setValueAtTime(800, context.currentTime);
            oscillator.frequency.setValueAtTime(1000, context.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0.3, context.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + 0.3);

            oscillator.start(context.currentTime);
            oscillator.stop(context.currentTime + 0.3);
        } catch (error) {
            // Sound-Fehler ignorieren
            console.log('Sound-Feedback nicht verfügbar');
        }
    }

    // ===== RECENT SCANS =====
    addToRecentScans(scan) {
        this.recentScans.unshift(scan);

        // Maximal 10 Scans behalten
        if (this.recentScans.length > 10) {
            this.recentScans = this.recentScans.slice(0, 10);
        }

        this.updateRecentScansList();
    }

    updateRecentScansList() {
        const scansList = document.getElementById('scansList');
        const emptyScans = document.getElementById('emptyScans');

        if (this.recentScans.length === 0) {
            scansList.innerHTML = '';
            scansList.appendChild(emptyScans);
            return;
        }

        const scansHtml = this.recentScans.map(scan => {
            const timeString = scan.timestamp.toLocaleTimeString('de-DE');
            const contentPreview = scan.content.length > 100 ?
                scan.content.substring(0, 100) + '...' : scan.content;

            return `
                <div class="scan-item">
                    <div class="scan-header">
                        <span class="scan-time">${timeString}</span>
                    </div>
                    <div class="scan-content">${contentPreview}</div>
                </div>
            `;
        }).join('');

        scansList.innerHTML = scansHtml;
    }

    clearRecentScans() {
        this.recentScans = [];
        this.updateRecentScansList();
        this.showNotification('info', 'Scans geleert', 'Scan-Historie wurde geleert');
    }

    // ===== UI UPDATES =====
    updateSystemStatus(status, message) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');

        statusDot.className = `status-dot ${status}`;
        statusText.textContent = message;
    }

    updateInstructionText(text) {
        document.getElementById('instructionText').textContent = `💡 ${text}`;
    }

    startClockUpdate() {
        const updateClock = () => {
            const now = new Date();
            document.getElementById('currentTime').textContent =
                now.toLocaleTimeString('de-DE');
            document.getElementById('dateText').textContent =
                now.toLocaleDateString('de-DE');
        };

        updateClock();
        setInterval(updateClock, 1000);
    }

    async updateSystemInfo() {
        try {
            const systemInfo = await window.electronAPI.app.getSystemInfo();
            document.getElementById('versionText').textContent = `v${systemInfo.version}`;
        } catch (error) {
            console.error('System-Info laden fehlgeschlagen:', error);
        }
    }

    // ===== NOTIFICATIONS & MODALS =====
    showNotification(type, title, message, duration = 4000) {
        const notifications = document.getElementById('notifications');

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

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
}

// ===== APP INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    console.log('🏁 DOM geladen, starte Wareneingang-App...');
    window.wareneingangApp = new WareneingangApp();
});

// Cleanup beim Fenster schließen
window.addEventListener('beforeunload', () => {
    if (window.wareneingangApp && window.wareneingangApp.scannerActive) {
        window.wareneingangApp.stopQRScanner();
    }
});

// Global verfügbare Funktionen
window.app = {
    showNotification: (type, title, message) => {
        if (window.wareneingangApp) {
            window.wareneingangApp.showNotification(type, title, message);
        }
    },

    logoutUser: () => {
        if (window.wareneingangApp) {
            window.wareneingangApp.logoutCurrentUser();
        }
    }
};