// QR Scanner class without external dependencies
class QRScanner {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.context = this.canvas.getContext('2d');
    }

    // Simple QR pattern detection (fallback method)
    detectQRPattern(imageData) {
        const { data, width, height } = imageData;

        // Convert to grayscale and look for QR patterns
        const grayscale = new Uint8Array(width * height);
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            grayscale[i / 4] = gray;
        }

        // Simple pattern detection for QR finder patterns
        // This is a basic implementation - for production use a proper QR library
        return this.findQRPatterns(grayscale, width, height);
    }

    findQRPatterns(grayscale, width, height) {
        // Look for the characteristic 1:1:3:1:1 pattern of QR finder patterns
        const threshold = 128;
        const patterns = [];

        // Scan horizontally
        for (let y = 0; y < height; y++) {
            let runLengths = [];
            let currentColor = grayscale[y * width] < threshold ? 0 : 1;
            let runLength = 1;

            for (let x = 1; x < width; x++) {
                const pixel = grayscale[y * width + x];
                const color = pixel < threshold ? 0 : 1;

                if (color === currentColor) {
                    runLength++;
                } else {
                    runLengths.push({ color: currentColor, length: runLength });
                    currentColor = color;
                    runLength = 1;
                }
            }
            runLengths.push({ color: currentColor, length: runLength });

            // Look for 1:1:3:1:1 pattern
            if (this.checkFinderPattern(runLengths)) {
                patterns.push({ x: 0, y: y, type: 'horizontal' });
            }
        }

        return patterns.length >= 3; // Need at least 3 finder patterns for a QR code
    }

    checkFinderPattern(runLengths) {
        if (runLengths.length < 5) return false;

        for (let i = 0; i <= runLengths.length - 5; i++) {
            const runs = runLengths.slice(i, i + 5);

            // Check if pattern is dark-light-dark-light-dark
            if (runs[0].color === 0 && runs[1].color === 1 && runs[2].color === 0 &&
                runs[3].color === 1 && runs[4].color === 0) {

                const lengths = runs.map(r => r.length);
                const unit = Math.min(...lengths);

                // Check approximate 1:1:3:1:1 ratio
                if (Math.abs(lengths[0] - unit) <= unit * 0.5 &&
                    Math.abs(lengths[1] - unit) <= unit * 0.5 &&
                    Math.abs(lengths[2] - 3 * unit) <= unit * 0.5 &&
                    Math.abs(lengths[3] - unit) <= unit * 0.5 &&
                    Math.abs(lengths[4] - unit) <= unit * 0.5) {
                    return true;
                }
            }
        }
        return false;
    }

    // Try to extract text from detected QR pattern area
    // This is a simplified version - for production use a proper QR decoder
    extractQRData(imageData, patterns) {
        // For now, return a placeholder indicating QR was detected
        // In a real implementation, this would decode the actual QR data
        return "QR_DETECTED_" + Date.now();
    }
}

class RFIDQRApp {
    constructor() {
        this.activeUsers = new Map();
        this.recentScans = [];
        this.scannerActive = false;
        this.videoStream = null;
        this.scannerAnimationId = null;
        this.lastScanTime = 0;
        this.scanCooldown = 2000; // 2 seconds between scans
        this.totalScans = 0;

        // QR Assignment mode
        this.qrAssignmentMode = 'last_login'; // last_login, round_robin, manual
        this.lastLoginUser = null;
        this.pendingQRCode = null;

        // Initialize QR Scanner
        this.qrScanner = new QRScanner();

        this.initializeApp();
    }

    async initializeApp() {
        console.log('Initializing RFID QR App...');

        // Setup event listeners
        this.setupEventListeners();

        // Setup IPC listeners
        this.setupIPCListeners();

        // Start update timer
        this.startUpdateTimer();

        // Update footer timestamp
        this.updateTimestamp();

        // Check camera availability
        await this.checkCameraAvailability();

        console.log('App initialization complete');
    }

    async checkCameraAvailability() {
        try {
            const devices = await window.cameraAPI.getDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length > 0) {
                console.log(`Found ${videoDevices.length} camera(s):`, videoDevices);
                this.updateScannerStatus('success', `${videoDevices.length} Kamera(s) verfügbar`);
            } else {
                console.warn('No cameras found');
                this.updateScannerStatus('warning', 'Keine Kamera gefunden');
            }
        } catch (error) {
            console.error('Failed to check camera availability:', error);
            this.updateScannerStatus('error', 'Kamera-Zugriff fehlgeschlagen');
        }
    }

    setupEventListeners() {
        // Header buttons
        document.getElementById('minimizeBtn').addEventListener('click', () => {
            window.electronAPI.app.minimize();
        });

        document.getElementById('closeBtn').addEventListener('click', () => {
            window.electronAPI.app.close();
        });

        document.getElementById('cameraTestBtn').addEventListener('click', () => {
            this.showCameraTestModal();
        });

        // Scanner controls
        document.getElementById('startScannerBtn').addEventListener('click', () => {
            this.startScanner();
        });

        document.getElementById('stopScannerBtn').addEventListener('click', () => {
            this.stopScanner();
        });

        document.getElementById('testQRBtn').addEventListener('click', () => {
            this.generateTestQR();
        });

        // User management
        document.getElementById('logoutAllBtn').addEventListener('click', () => {
            this.logoutAllUsers();
        });

        // Scans management
        document.getElementById('clearScansBtn').addEventListener('click', () => {
            this.clearRecentScans();
        });

        // Modal handlers
        this.setupModalHandlers();
    }

    setupModalHandlers() {
        // QR Assignment Modal
        const qrModal = document.getElementById('qrAssignmentModal');
        const qrModalClose = document.getElementById('qrAssignmentModalClose');
        const qrModalCancel = document.getElementById('qrAssignmentCancel');

        qrModalClose.addEventListener('click', () => this.hideQRAssignmentModal());
        qrModalCancel.addEventListener('click', () => this.hideQRAssignmentModal());

        // Error Modal
        const errorModal = document.getElementById('errorModal');
        const errorModalClose = document.getElementById('errorModalClose');
        const errorModalOk = document.getElementById('errorModalOk');

        errorModalClose.addEventListener('click', () => this.hideErrorModal());
        errorModalOk.addEventListener('click', () => this.hideErrorModal());

        // Camera Test Modal
        const cameraTestModal = document.getElementById('cameraTestModal');
        const cameraTestModalClose = document.getElementById('cameraTestModalClose');
        const cameraTestModalCancel = document.getElementById('cameraTestModalCancel');
        const requestPermissionBtn = document.getElementById('requestPermissionBtn');

        cameraTestModalClose.addEventListener('click', () => this.hideCameraTestModal());
        cameraTestModalCancel.addEventListener('click', () => this.hideCameraTestModal());
        requestPermissionBtn.addEventListener('click', () => this.requestCameraPermission());

        // Click outside to close
        [qrModal, errorModal, cameraTestModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('show');
                }
            });
        });
    }

    setupIPCListeners() {
        // System events
        window.electronAPI.on('system-ready', (data) => {
            console.log('System ready:', data);
            this.updateSystemStatus('active', 'System bereit');
            this.showNotification('success', 'System bereit', 'RFID und Datenbank verbunden');
        });

        window.electronAPI.on('system-error', (data) => {
            console.error('System error:', data);
            this.updateSystemStatus('error', 'System-Fehler');
            this.showErrorModal('System-Fehler', data.error);
        });

        // User events
        window.electronAPI.on('user-login', (data) => {
            console.log('User login:', data);
            this.handleUserLogin(data.user, data.session);
        });

        window.electronAPI.on('user-logout', (data) => {
            console.log('User logout:', data);
            this.handleUserLogout(data.user, data.sessionId);
        });

        // RFID events
        window.electronAPI.on('rfid-scan-error', (data) => {
            console.error('RFID scan error:', data);
            this.showNotification('error', 'RFID-Fehler', data.message);
        });
    }

    // QR Scanner Methods
    async startScanner() {
        if (this.scannerActive) return;

        try {
            console.log('Starting QR scanner...');

            // Check camera permission
            const permission = await window.cameraAPI.checkPermissions();
            console.log('Camera permission:', permission);

            if (permission === 'denied') {
                throw new Error('Kamera-Zugriff wurde verweigert. Bitte erlauben Sie den Kamera-Zugriff in den Browser-Einstellungen.');
            }

            // Get available cameras
            const devices = await window.cameraAPI.getDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            if (videoDevices.length === 0) {
                throw new Error('Keine Kamera gefunden. Bitte schließen Sie eine Kamera an.');
            }

            console.log(`Found ${videoDevices.length} camera(s):`, videoDevices);

            // Request camera access with multiple fallback options
            let constraints = {
                video: {
                    width: { ideal: 640, min: 320 },
                    height: { ideal: 480, min: 240 },
                    facingMode: 'environment'
                }
            };

            // Try with specific device first (if multiple cameras)
            if (videoDevices.length > 0) {
                // Prefer back camera if available
                const backCamera = videoDevices.find(device =>
                    device.label.toLowerCase().includes('back') ||
                    device.label.toLowerCase().includes('rear')
                );

                if (backCamera) {
                    constraints.video.deviceId = { exact: backCamera.deviceId };
                } else {
                    constraints.video.deviceId = { exact: videoDevices[0].deviceId };
                }
            }

            try {
                this.videoStream = await window.cameraAPI.getUserMedia(constraints);
            } catch (error) {
                console.warn('Failed with specific device, trying fallback constraints:', error);

                // Fallback: try without device ID
                constraints = {
                    video: {
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                };
                this.videoStream = await window.cameraAPI.getUserMedia(constraints);
            }

            // Setup video element
            const video = document.getElementById('scannerVideo');
            video.srcObject = this.videoStream;

            // Wait for video to load
            await new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    console.log('Video metadata loaded:', {
                        width: video.videoWidth,
                        height: video.videoHeight
                    });
                    this.updateCameraResolution(video);
                    resolve();
                };
                video.onerror = reject;

                // Timeout after 10 seconds
                setTimeout(() => reject(new Error('Video load timeout')), 10000);
            });

            await video.play();

            // Update UI
            this.scannerActive = true;
            this.updateScannerUI();

            // Start scanning loop
            this.startScanningLoop();

            console.log('QR scanner started successfully');
            this.showNotification('success', 'Scanner gestartet', 'QR-Codes werden automatisch erkannt');
            this.updateScannerStatus('success', 'Scanner aktiv');

        } catch (error) {
            console.error('Failed to start scanner:', error);
            this.showErrorModal('Scanner-Fehler',
                `Kamera konnte nicht gestartet werden: ${error.message}\n\n` +
                'Mögliche Lösungen:\n' +
                '• Kamera-Berechtigungen in den Browser-Einstellungen aktivieren\n' +
                '• Kamera von anderen Anwendungen trennen\n' +
                '• Anwendung neu starten'
            );
            this.updateScannerStatus('error', error.message);
        }
    }

    stopScanner() {
        if (!this.scannerActive) return;

        console.log('Stopping QR scanner...');

        // Stop video stream
        if (this.videoStream) {
            this.videoStream.getTracks().forEach(track => {
                track.stop();
                console.log('Stopped track:', track.kind, track.label);
            });
            this.videoStream = null;
        }

        // Stop animation loop
        if (this.scannerAnimationId) {
            cancelAnimationFrame(this.scannerAnimationId);
            this.scannerAnimationId = null;
        }

        // Clear video element
        const video = document.getElementById('scannerVideo');
        video.srcObject = null;

        // Update UI
        this.scannerActive = false;
        this.updateScannerUI();
        this.updateScannerStatus('info', 'Scanner gestoppt');

        console.log('QR scanner stopped');
        this.showNotification('info', 'Scanner gestoppt', 'QR-Scanner wurde beendet');
    }

    startScanningLoop() {
        const video = document.getElementById('scannerVideo');
        const canvas = document.getElementById('scannerCanvas');
        const context = canvas.getContext('2d');

        const scanFrame = () => {
            if (!this.scannerActive || !video.videoWidth || !video.videoHeight) {
                if (this.scannerActive) {
                    this.scannerAnimationId = requestAnimationFrame(scanFrame);
                }
                return;
            }

            try {
                // Set canvas size to match video
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                // Draw video frame to canvas
                context.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Get image data
                const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

                // Try to load external jsQR if available, otherwise use fallback
                if (typeof jsQR !== 'undefined') {
                    // Use jsQR library
                    const code = jsQR(imageData.data, imageData.width, imageData.height, {
                        inversionAttempts: "dontInvert"
                    });

                    if (code && code.data) {
                        this.handleQRCodeDetected(code.data);
                    }
                } else {
                    // Use fallback scanner
                    const hasQR = this.qrScanner.detectQRPattern(imageData);
                    if (hasQR) {
                        // For demonstration, create a mock QR code data
                        const mockData = `DEMO_QR_${Date.now()}_DETECTED`;
                        this.handleQRCodeDetected(mockData);
                    }
                }

            } catch (error) {
                console.error('Scanning error:', error);
            }

            // Continue scanning
            if (this.scannerActive) {
                this.scannerAnimationId = requestAnimationFrame(scanFrame);
            }
        };

        // Start the scanning loop
        this.scannerAnimationId = requestAnimationFrame(scanFrame);
        console.log('Started QR scanning loop');
    }

    handleQRCodeDetected(qrData) {
        const now = Date.now();

        // Check cooldown
        if (now - this.lastScanTime < this.scanCooldown) {
            return;
        }

        this.lastScanTime = now;

        console.log('QR Code detected:', qrData);

        // Check if any users are logged in
        if (this.activeUsers.size === 0) {
            this.showNotification('warning', 'Keine Benutzer', 'Melden Sie sich zuerst mit RFID an');
            return;
        }

        // Parse QR code
        const parsed = window.utils.parseQRPayload(qrData);

        // Handle assignment based on mode
        switch (this.qrAssignmentMode) {
            case 'manual':
                this.showQRAssignmentModal(qrData, parsed);
                break;
            case 'last_login':
                if (this.lastLoginUser && this.activeUsers.has(this.lastLoginUser)) {
                    this.assignQRToUser(qrData, parsed, this.lastLoginUser);
                } else {
                    // Fallback to first available user
                    const firstUser = this.activeUsers.keys().next().value;
                    this.assignQRToUser(qrData, parsed, firstUser);
                }
                break;
            case 'round_robin':
                // Simple round-robin: cycle through active users
                const userIds = Array.from(this.activeUsers.keys());
                const currentIndex = userIds.indexOf(this.lastLoginUser) || 0;
                const nextIndex = (currentIndex + 1) % userIds.length;
                this.assignQRToUser(qrData, parsed, userIds[nextIndex]);
                break;
            default:
                // Default to first available user
                const defaultUser = this.activeUsers.keys().next().value;
                this.assignQRToUser(qrData, parsed, defaultUser);
        }

        // Visual feedback
        this.showScanFeedback();
    }

    async assignQRToUser(qrData, parsed, userId) {
        const user = this.activeUsers.get(userId);
        if (!user) return;

        try {
            // Save to database
            const result = await window.electronAPI.qr.saveScan(user.sessionId, qrData);

            if (result) {
                // Update local data
                user.scanCount++;
                user.lastScanTime = new Date();

                // Add to recent scans
                this.addRecentScan({
                    id: result.ID,
                    timestamp: result.CapturedTS || new Date(),
                    user: user.name,
                    userId: userId,
                    content: qrData,
                    parsed: parsed
                });

                // Update UI
                this.updateUsersList();
                this.updateStats();

                // Show success notification
                this.showNotification('success', 'QR-Code erfasst',
                    `Zugeordnet an ${user.name}: ${parsed.display.substring(0, 50)}...`);

                console.log(`QR code assigned to user ${user.name}:`, qrData);

            } else {
                throw new Error('Fehler beim Speichern des QR-Codes');
            }

        } catch (error) {
            console.error('Failed to assign QR code:', error);
            this.showNotification('error', 'Speicher-Fehler', error.message);
        }
    }

    showScanFeedback() {
        // Visual feedback in scanner area
        const overlay = document.querySelector('.scanner-overlay');
        overlay.style.background = 'rgba(16, 185, 129, 0.2)';

        setTimeout(() => {
            overlay.style.background = '';
        }, 500);

        // Update last scan time
        document.getElementById('lastScanTime').textContent =
            window.utils.formatTimestamp(new Date(), 'time');
    }

    // User Management
    handleUserLogin(user, session) {
        const userData = {
            id: user.ID,
            name: user.BenutzerName,
            email: user.Email,
            sessionId: session.ID,
            startTime: new Date(session.StartTS),
            scanCount: 0,
            lastScanTime: null
        };

        this.activeUsers.set(user.ID, userData);
        this.lastLoginUser = user.ID;

        this.updateUsersList();
        this.updateStats();

        this.showNotification('success', 'Benutzer angemeldet',
            `${user.BenutzerName} erfolgreich angemeldet`);
    }

    handleUserLogout(user, sessionId) {
        this.activeUsers.delete(user.ID);

        if (this.lastLoginUser === user.ID) {
            this.lastLoginUser = this.activeUsers.size > 0 ?
                this.activeUsers.keys().next().value : null;
        }

        this.updateUsersList();
        this.updateStats();

        this.showNotification('info', 'Benutzer abgemeldet',
            `${user.BenutzerName} erfolgreich abgemeldet`);
    }

    async logoutAllUsers() {
        if (this.activeUsers.size === 0) {
            this.showNotification('info', 'Keine Benutzer', 'Keine aktiven Benutzer zum Abmelden');
            return;
        }

        const userCount = this.activeUsers.size;

        // End all sessions
        for (const user of this.activeUsers.values()) {
            try {
                await window.electronAPI.session.end(user.sessionId);
            } catch (error) {
                console.error('Failed to end session:', error);
            }
        }

        // Clear local data
        this.activeUsers.clear();
        this.lastLoginUser = null;

        this.updateUsersList();
        this.updateStats();

        this.showNotification('success', 'Alle abgemeldet',
            `${userCount} Benutzer erfolgreich abgemeldet`);
    }

    // UI Updates
    updateUsersList() {
        const usersList = document.getElementById('usersList');
        const emptyState = document.getElementById('usersEmptyState');

        if (this.activeUsers.size === 0) {
            usersList.innerHTML = '';
            usersList.appendChild(emptyState);
            return;
        }

        const usersHtml = Array.from(this.activeUsers.values()).map(user => {
            const duration = Math.floor((Date.now() - user.startTime.getTime()) / 1000);
            const lastScan = user.lastScanTime ?
                window.utils.formatTimestamp(user.lastScanTime, 'time') : '-';

            return `
                <div class="user-card ${user.id === this.lastLoginUser ? 'active' : ''}">
                    <div class="user-header">
                        <div class="user-name">${user.name}</div>
                        <div class="user-status">
                            <span class="status-dot active"></span>
                            Aktiv
                        </div>
                    </div>
                    <div class="user-details">
                        <div class="user-detail">
                            <span>Start:</span>
                            <span>${window.utils.formatTimestamp(user.startTime, 'time')}</span>
                        </div>
                        <div class="user-detail">
                            <span>Dauer:</span>
                            <span>${window.utils.formatDuration(duration)}</span>
                        </div>
                        <div class="user-detail">
                            <span>Scans:</span>
                            <span>${user.scanCount}</span>
                        </div>
                        <div class="user-detail">
                            <span>Letzter Scan:</span>
                            <span>${lastScan}</span>
                        </div>
                    </div>
                    <div class="user-actions">
                        <button class="btn btn-error btn-small" onclick="app.logoutUser(${user.id})">
                            Abmelden
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        usersList.innerHTML = usersHtml;
    }

    async logoutUser(userId) {
        const user = this.activeUsers.get(userId);
        if (!user) return;

        try {
            await window.electronAPI.session.end(user.sessionId);
            this.activeUsers.delete(userId);

            if (this.lastLoginUser === userId) {
                this.lastLoginUser = this.activeUsers.size > 0 ?
                    this.activeUsers.keys().next().value : null;
            }

            this.updateUsersList();
            this.updateStats();

            this.showNotification('info', 'Benutzer abgemeldet',
                `${user.name} erfolgreich abgemeldet`);
        } catch (error) {
            console.error('Failed to logout user:', error);
            this.showNotification('error', 'Abmelde-Fehler', error.message);
        }
    }

    updateStats() {
        document.getElementById('activeUsersCount').textContent = this.activeUsers.size;

        // Calculate total scans from all users
        const totalScans = Array.from(this.activeUsers.values())
            .reduce((sum, user) => sum + user.scanCount, 0);
        document.getElementById('totalScansCount').textContent = totalScans;
    }

    updateScannerUI() {
        const startBtn = document.getElementById('startScannerBtn');
        const stopBtn = document.getElementById('stopScannerBtn');
        const statusText = document.getElementById('scannerStatusText');
        const scannerStatus = document.getElementById('scannerStatus');

        if (this.scannerActive) {
            startBtn.style.display = 'none';
            stopBtn.style.display = 'inline-flex';
            statusText.textContent = 'Scanner aktiv';
            scannerStatus.style.display = 'none';
        } else {
            startBtn.style.display = 'inline-flex';
            stopBtn.style.display = 'none';
            statusText.textContent = 'Scanner gestoppt';
            scannerStatus.style.display = 'flex';
        }
    }

    updateScannerStatus(type, message) {
        const statusText = document.getElementById('scannerStatusText');
        statusText.textContent = message;
        statusText.className = `value ${type}`;

        // Also update the scanner status overlay
        const scannerStatus = document.getElementById('scannerStatus');
        const statusTextElement = scannerStatus.querySelector('.text');
        if (statusTextElement) {
            statusTextElement.textContent = message;
        }
    }

    updateSystemStatus(status, message) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');

        statusDot.className = `status-dot ${status}`;
        statusText.textContent = message;
    }

    // Recent Scans Management
    addRecentScan(scan) {
        this.recentScans.unshift(scan);

        // Keep only last 20 scans
        if (this.recentScans.length > 20) {
            this.recentScans = this.recentScans.slice(0, 20);
        }

        this.updateRecentScansList();
    }

    updateRecentScansList() {
        const scansList = document.getElementById('scansList');
        const emptyState = document.getElementById('scansEmptyState');

        if (this.recentScans.length === 0) {
            scansList.innerHTML = '';
            scansList.appendChild(emptyState);
            return;
        }

        const scansHtml = this.recentScans.map(scan => `
            <div class="scan-item">
                <div class="scan-header">
                    <div class="scan-time">${window.utils.formatTimestamp(scan.timestamp, 'time')}</div>
                    <div class="scan-user">${scan.user}</div>
                </div>
                <div class="scan-content">${scan.parsed.display}</div>
            </div>
        `).join('');

        scansList.innerHTML = scansHtml;
    }

    clearRecentScans() {
        this.recentScans = [];
        this.updateRecentScansList();
        this.showNotification('info', 'Scans geleert', 'Scan-Historie wurde geleert');
    }

    // QR Assignment Modal
    showQRAssignmentModal(qrData, parsed) {
        const modal = document.getElementById('qrAssignmentModal');
        const content = document.getElementById('qrAssignmentContent');
        const usersContainer = document.getElementById('qrAssignmentUsers');

        // Set QR content
        content.textContent = parsed.display;

        // Create user buttons
        const userButtons = Array.from(this.activeUsers.values()).map(user => `
            <button class="user-btn" onclick="app.assignQRFromModal('${qrData}', ${user.id})">
                <div class="user-info">
                    <div class="user-name">${user.name}</div>
                    <div class="user-session">
                        ${window.utils.formatDuration(Math.floor((Date.now() - user.startTime.getTime()) / 1000))} aktiv, ${user.scanCount} Scans
                    </div>
                </div>
            </button>
        `).join('');

        usersContainer.innerHTML = userButtons;

        // Store pending QR code
        this.pendingQRCode = { data: qrData, parsed: parsed };

        // Show modal
        modal.classList.add('show');
    }

    hideQRAssignmentModal() {
        const modal = document.getElementById('qrAssignmentModal');
        modal.classList.remove('show');
        this.pendingQRCode = null;
    }

    assignQRFromModal(qrData, userId) {
        if (this.pendingQRCode && this.pendingQRCode.data === qrData) {
            this.assignQRToUser(qrData, this.pendingQRCode.parsed, userId);
            this.hideQRAssignmentModal();
        }
    }

    // Error Modal
    showErrorModal(title, message) {
        const modal = document.getElementById('errorModal');
        const titleElement = document.querySelector('#errorModal .modal-title');
        const messageElement = document.getElementById('errorMessage');

        titleElement.innerHTML = `<span class="icon">⚠️</span>${title}`;
        messageElement.innerHTML = message.replace(/\n/g, '<br>');

        modal.classList.add('show');
    }

    hideErrorModal() {
        const modal = document.getElementById('errorModal');
        modal.classList.remove('show');
    }

    // Notifications
    showNotification(type, title, message, duration = 5000) {
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
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close">✕</button>
        `;

        // Add close handler
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });

        // Add to container
        notifications.appendChild(notification);

        // Auto-remove after duration
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, duration);
    }

    // Update Timer
    startUpdateTimer() {
        setInterval(() => {
            this.updateUsersList();
            this.updateTimestamp();
        }, 1000);
    }

    updateTimestamp() {
        const timestampElement = document.getElementById('timestampText');
        timestampElement.textContent = new Date().toLocaleString('de-DE');
    }

    // Get system info and update version
    async updateSystemInfo() {
        try {
            const systemInfo = await window.electronAPI.app.getSystemInfo();
            const versionElement = document.getElementById('versionText');
            versionElement.textContent = `v${systemInfo.version}`;

            // Store in config for other components
            window.config.version = systemInfo.version;
        } catch (error) {
            console.error('Failed to get system info:', error);
        }
    }

    // Camera Test Functions
    async showCameraTestModal() {
        const modal = document.getElementById('cameraTestModal');
        await this.updateCameraTestInfo();
        modal.classList.add('show');
    }

    hideCameraTestModal() {
        const modal = document.getElementById('cameraTestModal');
        modal.classList.remove('show');
    }

    async updateCameraTestInfo() {
        try {
            // Get camera devices
            const devices = await window.cameraAPI.getDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');

            const cameraList = document.getElementById('cameraList');
            if (videoDevices.length > 0) {
                const listHtml = videoDevices.map((device, index) => `
                    <div class="camera-device">
                        <strong>Kamera ${index + 1}:</strong> ${device.label || 'Unbekannte Kamera'}
                        <br><small>ID: ${device.deviceId.substring(0, 20)}...</small>
                    </div>
                `).join('');
                cameraList.innerHTML = listHtml;
            } else {
                cameraList.innerHTML = '<div class="camera-device error">Keine Kameras gefunden</div>';
            }

            // Check permissions
            const permission = await window.cameraAPI.checkPermissions();
            const permissionStatus = document.getElementById('permissionStatus');

            let permissionHtml = '';
            switch (permission) {
                case 'granted':
                    permissionHtml = '<span class="permission-granted">✅ Erlaubt</span>';
                    break;
                case 'denied':
                    permissionHtml = '<span class="permission-denied">❌ Verweigert</span>';
                    break;
                case 'prompt':
                    permissionHtml = '<span class="permission-prompt">⚠️ Nachfrage erforderlich</span>';
                    break;
                default:
                    permissionHtml = '<span class="permission-unknown">❓ Unbekannt</span>';
            }
            permissionStatus.innerHTML = permissionHtml;

            // Update camera info in main UI
            const cameraInfo = document.getElementById('cameraInfo');
            cameraInfo.textContent = `${videoDevices.length} verfügbar`;

        } catch (error) {
            console.error('Failed to update camera test info:', error);
            document.getElementById('cameraList').innerHTML = '<div class="camera-device error">Fehler beim Laden der Kamera-Informationen</div>';
        }
    }

    async requestCameraPermission() {
        try {
            const stream = await window.cameraAPI.getUserMedia({ video: true });

            // Stop the stream immediately - we just wanted to trigger permission request
            stream.getTracks().forEach(track => track.stop());

            this.showNotification('success', 'Berechtigung erteilt', 'Kamera-Zugriff wurde erlaubt');

            // Update the info
            setTimeout(() => this.updateCameraTestInfo(), 500);

        } catch (error) {
            console.error('Permission request failed:', error);
            this.showNotification('error', 'Berechtigung verweigert', 'Kamera-Zugriff wurde nicht erlaubt');
        }
    }

    // Test QR Generation
    generateTestQR() {
        const testData = {
            type: 'test',
            timestamp: new Date().toISOString(),
            id: Math.random().toString(36).substring(7),
            product: 'Test-Produkt',
            batch: 'BATCH-' + Math.floor(Math.random() * 1000)
        };

        const qrContent = JSON.stringify(testData);

        // Simulate QR detection
        this.handleQRCodeDetected(qrContent);

        this.showNotification('info', 'Test QR generiert',
            `Test QR-Code wurde simuliert: ${testData.id}`);
    }

    // Enhanced scanner status updates
    updateScannerStatus(type, message) {
        const statusText = document.getElementById('scannerStatusText');
        statusText.textContent = message;
        statusText.className = `value ${type}`;

        // Also update the scanner status overlay
        const scannerStatus = document.getElementById('scannerStatus');
        const statusTextElement = scannerStatus.querySelector('.text');
        if (statusTextElement) {
            statusTextElement.textContent = message;
        }

        // Update scanner status color based on type
        const statusDot = scannerStatus.querySelector('.icon');
        if (statusDot) {
            statusDot.style.color = type === 'success' ? '#10b981' :
                type === 'error' ? '#ef4444' :
                    type === 'warning' ? '#f59e0b' : '#64748b';
        }
    }

    // Update camera resolution info
    updateCameraResolution(video) {
        const resolutionInfo = document.getElementById('resolutionInfo');
        if (video && video.videoWidth && video.videoHeight) {
            resolutionInfo.textContent = `${video.videoWidth}x${video.videoHeight}`;
        } else {
            resolutionInfo.textContent = '-';
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    window.app = new RFIDQRApp();

    // Update system info
    window.app.updateSystemInfo();
});

// Handle window beforeunload
window.addEventListener('beforeunload', () => {
    if (window.app && window.app.scannerActive) {
        window.app.stopScanner();
    }
});

// Load jsQR library from CDN as fallback
const script = document.createElement('script');
script.src = 'https://unpkg.com/jsqr@1.4.0/dist/jsQR.js';
script.onload = () => {
    console.log('✅ jsQR library loaded successfully');
};
script.onerror = () => {
    console.warn('⚠️ jsQR library failed to load, using fallback QR detection');
};
document.head.appendChild(script);