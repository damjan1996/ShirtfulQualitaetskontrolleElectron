// ===== renderer/qr-scanner.js =====
// QR-Scanner Integration für die Hauptanwendung

class QRScannerIntegration {
    constructor(app) {
        this.app = app;
        this.container = null;
        this.scanner = null;
        this.isActive = false;

        // Event-Handler für Hauptanwendung
        this.onScanSuccess = null;
        this.onScanError = null;
    }

    // QR-Scanner-Bereich in die Hauptanwendung einbetten
    async initialize(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error('QR-Scanner Container nicht gefunden:', containerId);
            return false;
        }

        await this.loadQRScannerHTML();
        this.setupEventListeners();
        return true;
    }

    async loadQRScannerHTML() {
        // QR-Scanner UI laden (vereinfacht für Integration)
        this.container.innerHTML = `
            <div class="qr-scanner-section">
                <div class="scanner-header">
                    <h3>📸 QR-Code Scanner</h3>
                    <div class="scanner-controls">
                        <button id="qr-start-btn" class="btn btn-primary">Scanner starten</button>
                        <button id="qr-stop-btn" class="btn btn-danger" style="display: none;">Stoppen</button>
                    </div>
                </div>
                
                <div class="scanner-content">
                    <!-- Kamera-Bereich -->
                    <div class="camera-preview">
                        <video id="qr-video" autoplay muted></video>
                        <div id="qr-status" class="scanner-status">Bereit</div>
                    </div>
                    
                    <!-- Aktueller Scan -->
                    <div id="current-scan-display" class="current-scan-display">
                        <div class="scan-placeholder">
                            <span>📦</span>
                            <p>Bereit zum Scannen</p>
                        </div>
                    </div>
                </div>
                
                <!-- Scan-Historie -->
                <div class="scan-history-section">
                    <div class="history-header">
                        <h4>Erfasste Pakete</h4>
                        <span id="scan-count" class="scan-counter">0</span>
                    </div>
                    <div class="history-table-wrapper">
                        <table id="scan-history-table">
                            <thead>
                                <tr>
                                    <th>Zeit</th>
                                    <th>Auftrag</th>
                                    <th>Paket</th>
                                    <th>Kunde</th>
                                </tr>
                            </thead>
                            <tbody id="scan-history-body">
                                <tr class="empty-row">
                                    <td colspan="4">Keine Pakete erfasst</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Styles laden
        this.injectStyles();
    }

    setupEventListeners() {
        document.getElementById('qr-start-btn').addEventListener('click', () => this.startScanner());
        document.getElementById('qr-stop-btn').addEventListener('click', () => this.stopScanner());
    }

    async startScanner() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            });

            const video = document.getElementById('qr-video');
            video.srcObject = stream;

            video.onloadedmetadata = () => {
                this.initQRScanning();
            };

            this.updateScannerStatus(true);
            this.toggleControls(true);

        } catch (error) {
            console.error('Kamera-Zugriff fehlgeschlagen:', error);
            this.showError('Kamera konnte nicht gestartet werden');
        }
    }

    stopScanner() {
        const video = document.getElementById('qr-video');
        const stream = video.srcObject;

        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
        }

        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }

        this.isActive = false;
        this.updateScannerStatus(false);
        this.toggleControls(false);
    }

    initQRScanning() {
        const video = document.getElementById('qr-video');
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        this.isActive = true;
        let lastScanTime = 0;
        const scanCooldown = 2000; // 2 Sekunden

        this.scanInterval = setInterval(() => {
            if (video.readyState === video.HAVE_ENOUGH_DATA && this.isActive) {
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
                const code = jsQR(imageData.data, imageData.width, imageData.height);

                if (code && Date.now() - lastScanTime > scanCooldown) {
                    lastScanTime = Date.now();
                    this.processQRCode(code.data);
                }
            }
        }, 100);
    }

    async processQRCode(qrData) {
        console.log('QR-Code erkannt:', qrData);

        // Duplikat-Prüfung über Hauptanwendung
        const isDuplicate = await this.app.isDuplicateQRCode(qrData);

        if (isDuplicate) {
            this.showScanResult(qrData, false, 'Bereits gescannt');
            this.playSound('error');
            return;
        }

        // QR-Code dekodieren
        const decodedData = this.decodeQRData(qrData);

        if (decodedData && decodedData.auftrag) {
            // Scan an Hauptanwendung weiterleiten
            const scanResult = await this.app.saveQRScan({
                timestamp: new Date(),
                rawData: qrData,
                ...decodedData
            });

            if (scanResult.success) {
                this.showScanResult(qrData, true, 'Erfolgreich gespeichert', decodedData);
                this.addToHistory(decodedData);
                this.playSound('success');

                // Event an Hauptanwendung
                if (this.onScanSuccess) {
                    this.onScanSuccess(scanResult);
                }
            } else {
                this.showScanResult(qrData, false, scanResult.error || 'Speichern fehlgeschlagen');
                this.playSound('error');
            }
        } else {
            this.showScanResult(qrData, false, 'Ungültiges QR-Code Format');
            this.playSound('error');

            if (this.onScanError) {
                this.onScanError({ qrData, error: 'Invalid format' });
            }
        }
    }

    decodeQRData(qrData) {
        try {
            // Format: "126644896^25000580^010010277918^6^2802-834"
            const parts = qrData.split('^');

            if (parts.length >= 3) {
                return {
                    auftrag: parts[0] || 'Unbekannt',
                    kunde: parts[1] || 'Unbekannt',
                    paket: parts[2] || 'Unbekannt'
                };
            }

            // JSON-Fallback
            const jsonData = JSON.parse(qrData);
            return {
                auftrag: jsonData.auftrag || jsonData.order || 'Unbekannt',
                kunde: jsonData.kunde || jsonData.customer || 'Unbekannt',
                paket: jsonData.paket || jsonData.package || 'Unbekannt'
            };

        } catch (error) {
            console.warn('QR-Dekodierung fehlgeschlagen:', error);
            return null;
        }
    }

    showScanResult(qrData, success, message, decodedData = null) {
        const container = document.getElementById('current-scan-display');
        const timestamp = new Date().toLocaleTimeString('de-DE');

        container.className = `current-scan-display ${success ? 'success' : 'error'}`;
        container.innerHTML = `
            <div class="scan-result">
                <div class="scan-header">
                    <span class="scan-status ${success ? 'success' : 'error'}">
                        ${success ? '✅' : '❌'} ${message}
                    </span>
                    <span class="scan-time">${timestamp}</span>
                </div>
                
                <div class="scan-raw-data">${qrData}</div>
                
                ${decodedData ? `
                    <div class="scan-decoded">
                        <div class="decoded-item">
                            <label>Auftrag:</label>
                            <span>${decodedData.auftrag}</span>
                        </div>
                        <div class="decoded-item">
                            <label>Paket:</label>
                            <span>${decodedData.paket}</span>
                        </div>
                        <div class="decoded-item">
                            <label>Kunde:</label>
                            <span>${decodedData.kunde}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    addToHistory(scanData) {
        const tbody = document.getElementById('scan-history-body');
        const counter = document.getElementById('scan-count');

        // Empty-Row entfernen falls vorhanden
        const emptyRow = tbody.querySelector('.empty-row');
        if (emptyRow) {
            emptyRow.remove();
        }

        // Neue Zeile hinzufügen (oben)
        const newRow = document.createElement('tr');
        newRow.innerHTML = `
            <td class="time-cell">${new Date().toLocaleTimeString('de-DE')}</td>
            <td class="id-cell">${scanData.auftrag}</td>
            <td class="id-cell">${scanData.paket}</td>
            <td class="id-cell">${scanData.kunde}</td>
        `;

        tbody.insertBefore(newRow, tbody.firstChild);

        // Counter aktualisieren
        const currentCount = parseInt(counter.textContent) || 0;
        counter.textContent = currentCount + 1;
    }

    updateScannerStatus(active) {
        const status = document.getElementById('qr-status');
        status.textContent = active ? 'Scanning...' : 'Bereit';
        status.className = `scanner-status ${active ? 'active' : 'inactive'}`;
    }

    toggleControls(scanning) {
        document.getElementById('qr-start-btn').style.display = scanning ? 'none' : 'inline-block';
        document.getElementById('qr-stop-btn').style.display = scanning ? 'inline-block' : 'none';
    }

    playSound(type) {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            if (type === 'success') {
                oscillator.frequency.value = 800;
                gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
                oscillator.stop(audioContext.currentTime + 0.3);
            } else {
                oscillator.frequency.value = 300;
                gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
                oscillator.stop(audioContext.currentTime + 0.5);
            }

            oscillator.start();
        } catch (error) {
            console.warn('Audio-Feedback nicht verfügbar:', error);
        }
    }

    showError(message) {
        const container = document.getElementById('current-scan-display');
        container.className = 'current-scan-display error';
        container.innerHTML = `
            <div class="error-state">
                <span class="error-icon">⚠️</span>
                <p>${message}</p>
            </div>
        `;
    }

    // CSS-Styles für Integration
    injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .qr-scanner-section {
                background: white;
                border-radius: 10px;
                padding: 20px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            }
            
            .scanner-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
                border-bottom: 2px solid #f0f0f0;
                padding-bottom: 15px;
            }
            
            .scanner-content {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 20px;
                margin-bottom: 20px;
            }
            
            .camera-preview {
                position: relative;
                background: #f8f9fa;
                border-radius: 8px;
                overflow: hidden;
                min-height: 200px;
            }
            
            #qr-video {
                width: 100%;
                height: 100%;
                object-fit: cover;
            }
            
            .scanner-status {
                position: absolute;
                top: 10px;
                left: 10px;
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 0.8rem;
                font-weight: 600;
            }
            
            .scanner-status.active {
                background: #28a745;
                color: white;
            }
            
            .scanner-status.inactive {
                background: #6c757d;
                color: white;
            }
            
            .current-scan-display {
                background: #f8f9fa;
                border-radius: 8px;
                padding: 15px;
                min-height: 200px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
            }
            
            .current-scan-display.success {
                background: linear-gradient(135deg, #d4edda, #c3e6cb);
                border: 2px solid #28a745;
            }
            
            .current-scan-display.error {
                background: linear-gradient(135deg, #f8d7da, #f5c6cb);
                border: 2px solid #dc3545;
            }
            
            .scan-placeholder {
                text-align: center;
                color: #6c757d;
            }
            
            .scan-placeholder span {
                font-size: 3rem;
                display: block;
                margin-bottom: 10px;
            }
            
            .scan-result {
                width: 100%;
            }
            
            .scan-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .scan-status.success {
                color: #28a745;
                font-weight: 600;
            }
            
            .scan-status.error {
                color: #dc3545;
                font-weight: 600;
            }
            
            .scan-time {
                font-size: 0.9rem;
                color: #6c757d;
            }
            
            .scan-raw-data {
                font-family: 'Courier New', monospace;
                background: rgba(255,255,255,0.7);
                padding: 10px;
                border-radius: 5px;
                font-size: 0.9rem;
                word-break: break-all;
                margin-bottom: 15px;
                border-left: 4px solid #007bff;
            }
            
            .scan-decoded {
                display: grid;
                gap: 8px;
            }
            
            .decoded-item {
                display: flex;
                justify-content: space-between;
                padding: 8px 12px;
                background: rgba(255,255,255,0.8);
                border-radius: 5px;
            }
            
            .decoded-item label {
                font-weight: 600;
                color: #495057;
            }
            
            .decoded-item span {
                font-family: 'Courier New', monospace;
                color: #007bff;
            }
            
            .scan-history-section {
                border-top: 2px solid #f0f0f0;
                padding-top: 20px;
            }
            
            .history-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
            }
            
            .scan-counter {
                background: #007bff;
                color: white;
                padding: 5px 12px;
                border-radius: 15px;
                font-size: 0.9rem;
                font-weight: 600;
            }
            
            .history-table-wrapper {
                border: 1px solid #dee2e6;
                border-radius: 8px;
                overflow: hidden;
                max-height: 300px;
                overflow-y: auto;
            }
            
            #scan-history-table {
                width: 100%;
                border-collapse: collapse;
            }
            
            #scan-history-table th {
                background: #f8f9fa;
                padding: 12px;
                text-align: left;
                font-weight: 600;
                border-bottom: 2px solid #dee2e6;
                position: sticky;
                top: 0;
                z-index: 1;
            }
            
            #scan-history-table td {
                padding: 10px 12px;
                border-bottom: 1px solid #dee2e6;
            }
            
            #scan-history-table tr:hover {
                background: #f8f9fa;
            }
            
            .time-cell {
                font-size: 0.85rem;
                color: #6c757d;
                font-family: 'Courier New', monospace;
            }
            
            .id-cell {
                font-family: 'Courier New', monospace;
                font-weight: 600;
                color: #007bff;
            }
            
            .empty-row td {
                text-align: center;
                color: #6c757d;
                font-style: italic;
                padding: 30px;
            }
            
            .error-state {
                text-align: center;
                color: #dc3545;
            }
            
            .error-icon {
                font-size: 2rem;
                display: block;
                margin-bottom: 10px;
            }
        `;

        document.head.appendChild(style);
    }

    // Externe API für Hauptanwendung
    setEventHandlers(onSuccess, onError) {
        this.onScanSuccess = onSuccess;
        this.onScanError = onError;
    }

    clearHistory() {
        const tbody = document.getElementById('scan-history-body');
        const counter = document.getElementById('scan-count');

        tbody.innerHTML = `
            <tr class="empty-row">
                <td colspan="4">Keine Pakete erfasst</td>
            </tr>
        `;
        counter.textContent = '0';
    }

    isScanning() {
        return this.isActive;
    }
}

// Export für Hauptanwendung
if (typeof module !== 'undefined' && module.exports) {
    module.exports = QRScannerIntegration;
} else {
    window.QRScannerIntegration = QRScannerIntegration;
}