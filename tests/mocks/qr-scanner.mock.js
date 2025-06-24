// tests/mocks/qr-scanner.mock.js
/**
 * QR Scanner Mock für Tests
 */

const EventEmitter = require('events');

class MockQRScanner extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = {
            video: options.video || null,
            canvas: options.canvas || null,
            highlightScanRegion: options.highlightScanRegion || false,
            highlightCodeOutline: options.highlightCodeOutline || false,
            maxScansPerSecond: options.maxScansPerSecond || 25,
            preferredCamera: options.preferredCamera || 'environment',
            calculateScanRegion: options.calculateScanRegion || (() => ({ x: 0, y: 0, width: 100, height: 100 }))
        };

        this.isScanning = false;
        this.hasFlash = false;
        this.isFlashOn = false;
        this.cameras = [];
        this.currentCamera = null;
        this.scanHistory = [];
        this.stats = {
            totalScans: 0,
            successfulScans: 0,
            failedScans: 0,
            startTime: null,
            lastScan: null
        };

        // Mock-Kameras
        this.mockCameras = [
            {
                id: 'mock-camera-1',
                label: 'Mock Camera 1 (front)',
                facingMode: 'user'
            },
            {
                id: 'mock-camera-2',
                label: 'Mock Camera 2 (back)',
                facingMode: 'environment'
            }
        ];

        // Mock QR-Codes für Tests
        this.mockQRCodes = [
            'PACKAGE_001_ABC123',
            'PACKAGE_002_DEF456',
            'PACKAGE_003_GHI789',
            'ORDER_12345_XYZ',
            'SHIPMENT_98765_QWE',
            'PRODUCT_SKU_123456',
            'BARCODE_1234567890123',
            'https://example.com/package/123',
            'JSON:{"id":"pack_001","type":"package","order":"12345"}',
            'INVALID_QR_CODE_FORMAT'
        ];

        this.currentMockIndex = 0;
        this.scanDelay = 1000; // Delay zwischen automatischen Scans
        this.autoScan = false;
        this.autoScanInterval = null;
    }

    // ===== ÖFFENTLICHE API =====

    async start() {
        if (this.isScanning) {
            throw new Error('Scanner is already running');
        }

        try {
            // Mock-Kamera-Initialisierung
            await this._initializeMockCamera();

            this.isScanning = true;
            this.stats.startTime = new Date();

            this.emit('start');

            if (this.autoScan) {
                this._startAutoScan();
            }

            return true;
        } catch (error) {
            this.emit('error', error);
            throw error;
        }
    }

    async stop() {
        if (!this.isScanning) {
            return false;
        }

        this.isScanning = false;
        this._stopAutoScan();

        this.emit('stop');
        return true;
    }

    async pause() {
        if (!this.isScanning) {
            return false;
        }

        this._stopAutoScan();
        this.emit('pause');
        return true;
    }

    async resume() {
        if (!this.isScanning) {
            return false;
        }

        if (this.autoScan) {
            this._startAutoScan();
        }

        this.emit('resume');
        return true;
    }

    async setCamera(cameraId) {
        const camera = this.mockCameras.find(c => c.id === cameraId);
        if (!camera) {
            throw new Error(`Camera with id ${cameraId} not found`);
        }

        this.currentCamera = camera;
        this.emit('camera-change', camera);
        return camera;
    }

    static async listCameras() {
        return [
            {
                id: 'mock-camera-1',
                label: 'Mock Camera 1 (front)',
                facingMode: 'user'
            },
            {
                id: 'mock-camera-2',
                label: 'Mock Camera 2 (back)',
                facingMode: 'environment'
            }
        ];
    }

    async hasFlash() {
        return this.hasFlash;
    }

    async isFlashOn() {
        return this.isFlashOn;
    }

    async turnFlashOn() {
        if (!this.hasFlash) {
            throw new Error('Flash not available');
        }
        this.isFlashOn = true;
        this.emit('flash-on');
        return true;
    }

    async turnFlashOff() {
        this.isFlashOn = false;
        this.emit('flash-off');
        return true;
    }

    async toggleFlash() {
        if (this.isFlashOn) {
            await this.turnFlashOff();
        } else {
            await this.turnFlashOn();
        }
        return this.isFlashOn;
    }

    // ===== TEST-HELPER METHODEN =====

    // Simuliert einen QR-Code-Scan
    simulateScan(qrCodeData = null) {
        if (!this.isScanning) {
            return false;
        }

        const data = qrCodeData || this._getNextMockQRCode();
        const scanResult = this._createScanResult(data);

        this.scanHistory.push(scanResult);
        this.stats.totalScans++;
        this.stats.lastScan = new Date();

        if (scanResult.success) {
            this.stats.successfulScans++;
            this.emit('scan', scanResult);
        } else {
            this.stats.failedScans++;
            this.emit('scan-error', scanResult.error);
        }

        return scanResult;
    }

    // Aktiviert automatisches Scannen für Tests
    enableAutoScan(interval = 2000) {
        this.autoScan = true;
        this.scanDelay = interval;

        if (this.isScanning) {
            this._startAutoScan();
        }
    }

    // Deaktiviert automatisches Scannen
    disableAutoScan() {
        this.autoScan = false;
        this._stopAutoScan();
    }

    // Setzt Mock-QR-Codes für Tests
    setMockQRCodes(qrCodes) {
        this.mockQRCodes = qrCodes;
        this.currentMockIndex = 0;
    }

    // Fügt Mock-QR-Code hinzu
    addMockQRCode(qrCode) {
        this.mockQRCodes.push(qrCode);
    }

    // Simuliert Kamera-Fehler
    simulateCameraError(errorMessage = 'Camera access denied') {
        const error = new Error(errorMessage);
        error.name = 'NotAllowedError';
        this.emit('error', error);
        return error;
    }

    // Simuliert Flash-Verfügbarkeit
    setFlashAvailable(available = true) {
        this.hasFlash = available;
    }

    // Holt Scan-Statistiken
    getStats() {
        return {
            ...this.stats,
            scanRate: this._calculateScanRate(),
            uptime: this.stats.startTime ? Date.now() - this.stats.startTime.getTime() : 0
        };
    }

    // Holt Scan-Historie
    getScanHistory() {
        return [...this.scanHistory];
    }

    // Löscht Scan-Historie
    clearScanHistory() {
        this.scanHistory = [];
        this.stats = {
            totalScans: 0,
            successfulScans: 0,
            failedScans: 0,
            startTime: this.stats.startTime,
            lastScan: null
        };
    }

    // Setzt Scanner zurück
    reset() {
        this.stop();
        this.clearScanHistory();
        this.currentMockIndex = 0;
        this.isFlashOn = false;
        this.currentCamera = null;
    }

    // ===== PRIVATE METHODEN =====

    async _initializeMockCamera() {
        // Simuliert Kamera-Initialisierung
        await new Promise(resolve => setTimeout(resolve, 100));

        this.cameras = this.mockCameras;
        this.currentCamera = this.mockCameras.find(c =>
            c.facingMode === this.options.preferredCamera
        ) || this.mockCameras[0];

        // Simuliert Flash-Verfügbarkeit für Back-Kamera
        this.hasFlash = this.currentCamera.facingMode === 'environment';
    }

    _getNextMockQRCode() {
        if (this.mockQRCodes.length === 0) {
            return 'DEFAULT_QR_CODE';
        }

        const qrCode = this.mockQRCodes[this.currentMockIndex];
        this.currentMockIndex = (this.currentMockIndex + 1) % this.mockQRCodes.length;

        return qrCode;
    }

    _createScanResult(data) {
        // Simuliert unterschiedliche Scan-Szenarien
        const isValid = this._validateQRCode(data);
        const processingTime = Math.random() * 200 + 50; // 50-250ms

        const result = {
            data: data,
            timestamp: new Date().toISOString(),
            processingTime: Math.round(processingTime),
            camera: this.currentCamera ? this.currentCamera.id : null,
            success: isValid,
            scanCount: this.stats.totalScans + 1
        };

        if (!isValid) {
            result.error = 'Invalid QR code format';
            result.errorCode = 'INVALID_FORMAT';
        }

        return result;
    }

    _validateQRCode(data) {
        // Simuliert QR-Code-Validierung
        if (!data || typeof data !== 'string') {
            return false;
        }

        if (data.includes('INVALID')) {
            return false;
        }

        if (data.length < 3) {
            return false;
        }

        return true;
    }

    _startAutoScan() {
        if (this.autoScanInterval) {
            return;
        }

        this.autoScanInterval = setInterval(() => {
            if (this.isScanning) {
                this.simulateScan();
            }
        }, this.scanDelay);
    }

    _stopAutoScan() {
        if (this.autoScanInterval) {
            clearInterval(this.autoScanInterval);
            this.autoScanInterval = null;
        }
    }

    _calculateScanRate() {
        if (!this.stats.startTime || this.stats.totalScans === 0) {
            return 0;
        }

        const uptimeSeconds = (Date.now() - this.stats.startTime.getTime()) / 1000;
        return Math.round((this.stats.totalScans / uptimeSeconds) * 100) / 100;
    }
}

// Factory-Funktion für verschiedene Scanner-Modi
class MockQRScannerFactory {
    static createWebcamScanner(videoElement, options = {}) {
        const scanner = new MockQRScanner({
            video: videoElement,
            ...options
        });

        // Simuliert Webcam-spezifische Eigenschaften
        scanner.setFlashAvailable(true);
        scanner.enableAutoScan(1500);

        return scanner;
    }

    static createHandheldScanner(options = {}) {
        const scanner = new MockQRScanner(options);

        // Simuliert Handheld-Scanner-Eigenschaften
        scanner.scanDelay = 500;
        scanner.setMockQRCodes([
            'HANDHELD_SCAN_001',
            'HANDHELD_SCAN_002',
            'HANDHELD_SCAN_003'
        ]);

        return scanner;
    }

    static createMobileScanner(options = {}) {
        const scanner = new MockQRScanner({
            preferredCamera: 'environment',
            highlightScanRegion: true,
            highlightCodeOutline: true,
            ...options
        });

        scanner.setFlashAvailable(true);
        return scanner;
    }
}

// Mock für Browser-APIs
class MockMediaDevices {
    static async getUserMedia(constraints) {
        // Simuliert MediaDevices.getUserMedia()
        return {
            id: 'mock-video-stream',
            active: true,
            getTracks: () => [{
                kind: 'video',
                label: 'Mock Camera',
                enabled: true,
                stop: () => {}
            }]
        };
    }

    static async enumerateDevices() {
        return [
            {
                deviceId: 'mock-camera-1',
                groupId: 'group-1',
                kind: 'videoinput',
                label: 'Mock Camera 1'
            },
            {
                deviceId: 'mock-camera-2',
                groupId: 'group-2',
                kind: 'videoinput',
                label: 'Mock Camera 2'
            }
        ];
    }
}

module.exports = {
    MockQRScanner,
    MockQRScannerFactory,
    MockMediaDevices
};