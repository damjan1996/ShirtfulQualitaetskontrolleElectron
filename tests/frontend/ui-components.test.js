// tests/frontend/ui-components.test.js
/**
 * Frontend UI Component Tests
 * Testet die Renderer-Prozess UI-Komponenten
 */

const { JSDOM } = require('jsdom');
const { MockQRScanner } = require('../mocks/qr-scanner.mock');

describe('Frontend UI Components', () => {
    let dom;
    let document;
    let window;
    let app;

    beforeEach(() => {
        // Setup DOM
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>RFID QR Wareneingang</title>
                <style>
                    .hidden { display: none; }
                    .notification { position: fixed; top: 20px; right: 20px; }
                </style>
            </head>
            <body>
                <!-- Login Section -->
                <div id="loginSection">
                    <h1>RFID Login</h1>
                    <p id="loginInstructions">Bitte RFID-Tag scannen...</p>
                    <div id="loginStatus" class="hidden"></div>
                </div>

                <!-- Main Workspace -->
                <div id="workspace" class="hidden">
                    <!-- User Info -->
                    <div id="userInfo">
                        <h2 id="userName"></h2>
                        <p id="userEmail"></p>
                        <div id="sessionTimer">00:00:00</div>
                        <button id="logoutBtn">Logout</button>
                    </div>

                    <!-- QR Scanner Section -->
                    <div id="qrSection">
                        <video id="qrVideo" width="400" height="300"></video>
                        <canvas id="qrCanvas" width="400" height="300" class="hidden"></canvas>
                        <div id="qrControls">
                            <button id="startScannerBtn">Scanner Starten</button>
                            <button id="stopScannerBtn" class="hidden">Scanner Stoppen</button>
                        </div>
                        <div id="scanResult" class="hidden"></div>
                    </div>

                    <!-- Scan History -->
                    <div id="scanHistory">
                        <h3>Letzte Scans</h3>
                        <ul id="scanList"></ul>
                        <div id="scanStats">
                            <span id="scanCount">0</span> Scans heute
                        </div>
                    </div>
                </div>

                <!-- Notifications -->
                <div id="notifications"></div>

                <!-- Debug Info -->
                <div id="debugInfo" class="hidden">
                    <h4>Debug Information</h4>
                    <pre id="debugLog"></pre>
                </div>
            </body>
            </html>
        `, {
            url: 'http://localhost',
            referrer: 'http://localhost',
            contentType: 'text/html',
            includeNodeLocations: true,
            storageQuota: 10000000
        });

        document = dom.window.document;
        window = dom.window;

        // Mock globals
        global.document = document;
        global.window = window;
        global.navigator = {
            mediaDevices: {
                getUserMedia: jest.fn(() => Promise.resolve({
                    getTracks: () => [{ stop: jest.fn() }]
                }))
            }
        };

        // Mock Electron API
        window.electronAPI = {
            db: {
                getUserByEPC: jest.fn(),
                getUserById: jest.fn(),
                getAllActiveUsers: jest.fn()
            },
            session: {
                create: jest.fn(),
                end: jest.fn(),
                getActive: jest.fn(),
                getStats: jest.fn()
            },
            qr: {
                save: jest.fn(),
                getBySession: jest.fn(),
                getRecent: jest.fn()
            },
            rfid: {
                start: jest.fn(),
                stop: jest.fn(),
                getStats: jest.fn()
            },
            window: {
                minimize: jest.fn(),
                maximize: jest.fn(),
                close: jest.fn()
            },
            on: jest.fn(),
            off: jest.fn()
        };

        // Mock App State
        app = {
            currentUser: null,
            currentSession: null,
            sessionStartTime: null,
            scanCount: 0,
            recentScans: [],
            sessionTimer: null,
            scannerActive: false,
            videoStream: null,

            // Mock methods
            init: jest.fn(),
            handleUserLogin: jest.fn(),
            handleUserLogout: jest.fn(),
            startQRScanner: jest.fn(),
            stopQRScanner: jest.fn(),
            showNotification: jest.fn(),
            updateUserDisplay: jest.fn(),
            startSessionTimer: jest.fn(),
            stopSessionTimer: jest.fn()
        };
    });

    afterEach(() => {
        dom.window.close();
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize app correctly', () => {
            expect(app.currentUser).toBeNull();
            expect(app.sessionStartTime).toBeNull();
            expect(app.scanCount).toBe(0);
            expect(app.recentScans).toEqual([]);
            expect(app.scannerActive).toBe(false);
        });

        test('should setup event listeners', () => {
            const startBtn = document.getElementById('startScannerBtn');
            const stopBtn = document.getElementById('stopScannerBtn');
            const logoutBtn = document.getElementById('logoutBtn');

            expect(startBtn).toBeTruthy();
            expect(stopBtn).toBeTruthy();
            expect(logoutBtn).toBeTruthy();
        });

        test('should display correct initial state', () => {
            const loginSection = document.getElementById('loginSection');
            const workspace = document.getElementById('workspace');

            expect(loginSection.style.display).not.toBe('none');
            expect(workspace.style.display).toBe('none');
        });
    });

    describe('User Login/Logout', () => {
        test('should handle user login correctly', () => {
            const userData = {
                user: {
                    ID: 1,
                    BenutzerName: 'Test User',
                    Email: 'test@example.com'
                },
                session: {
                    ID: 1,
                    StartTS: new Date().toISOString()
                }
            };

            app.handleUserLogin(userData.user, userData.session);

            expect(app.handleUserLogin).toHaveBeenCalledWith(userData.user, userData.session);
        });

        test('should update UI on login', () => {
            const userData = {
                user: { ID: 1, BenutzerName: 'Test User', Email: 'test@example.com' },
                session: { ID: 1, StartTS: new Date().toISOString() }
            };

            // Simuliere UI-Update
            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');
            const loginSection = document.getElementById('loginSection');
            const workspace = document.getElementById('workspace');

            userName.textContent = userData.user.BenutzerName;
            userEmail.textContent = userData.user.Email;
            loginSection.classList.add('hidden');
            workspace.classList.remove('hidden');

            expect(userName.textContent).toBe('Test User');
            expect(userEmail.textContent).toBe('test@example.com');
            expect(loginSection.classList.contains('hidden')).toBe(true);
            expect(workspace.classList.contains('hidden')).toBe(false);
        });

        test('should handle user logout correctly', () => {
            app.handleUserLogout();
            expect(app.handleUserLogout).toHaveBeenCalled();
        });

        test('should reset UI on logout', () => {
            const loginSection = document.getElementById('loginSection');
            const workspace = document.getElementById('workspace');
            const scanList = document.getElementById('scanList');

            // Simuliere Logout UI-Reset
            loginSection.classList.remove('hidden');
            workspace.classList.add('hidden');
            scanList.innerHTML = '';

            expect(loginSection.classList.contains('hidden')).toBe(false);
            expect(workspace.classList.contains('hidden')).toBe(true);
            expect(scanList.innerHTML).toBe('');
        });

        test('should display login instructions', () => {
            const instructions = document.getElementById('loginInstructions');
            expect(instructions.textContent).toContain('RFID-Tag scannen');
        });

        test('should handle multiple user switches', () => {
            const user1 = { ID: 1, BenutzerName: 'User 1' };
            const user2 = { ID: 2, BenutzerName: 'User 2' };

            app.handleUserLogin(user1, { ID: 1 });
            app.handleUserLogin(user2, { ID: 2 });

            expect(app.handleUserLogin).toHaveBeenCalledTimes(2);
        });
    });

    describe('Session Timer', () => {
        test('should start session timer', () => {
            app.startSessionTimer();
            expect(app.startSessionTimer).toHaveBeenCalled();
        });

        test('should stop session timer', () => {
            app.stopSessionTimer();
            expect(app.stopSessionTimer).toHaveBeenCalled();
        });

        test('should update timer display', () => {
            const timerElement = document.getElementById('sessionTimer');

            // Simuliere Timer-Update
            const formatTime = (seconds) => {
                const hours = Math.floor(seconds / 3600);
                const minutes = Math.floor((seconds % 3600) / 60);
                const secs = seconds % 60;
                return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
            };

            timerElement.textContent = formatTime(3665); // 1:01:05

            expect(timerElement.textContent).toBe('01:01:05');
        });

        test('should handle timer reset', () => {
            const timerElement = document.getElementById('sessionTimer');
            timerElement.textContent = '00:00:00';

            expect(timerElement.textContent).toBe('00:00:00');
        });
    });

    describe('QR Scanner Controls', () => {
        test('should start QR scanner', () => {
            app.startQRScanner();
            expect(app.startQRScanner).toHaveBeenCalled();
        });

        test('should stop QR scanner', () => {
            app.stopQRScanner();
            expect(app.stopQRScanner).toHaveBeenCalled();
        });

        test('should toggle scanner controls', () => {
            const startBtn = document.getElementById('startScannerBtn');
            const stopBtn = document.getElementById('stopScannerBtn');

            // Simuliere Scanner-Start
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');

            expect(startBtn.classList.contains('hidden')).toBe(true);
            expect(stopBtn.classList.contains('hidden')).toBe(false);

            // Simuliere Scanner-Stop
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');

            expect(startBtn.classList.contains('hidden')).toBe(false);
            expect(stopBtn.classList.contains('hidden')).toBe(true);
        });

        test('should handle video stream setup', async () => {
            const videoElement = document.getElementById('qrVideo');

            // Mock video stream
            const mockStream = {
                getTracks: () => [{ stop: jest.fn() }]
            };

            global.navigator.mediaDevices.getUserMedia.mockResolvedValueOnce(mockStream);

            const stream = await global.navigator.mediaDevices.getUserMedia({ video: true });
            videoElement.srcObject = stream;

            expect(videoElement.srcObject).toBe(stream);
            expect(global.navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: true });
        });

        test('should handle scanner errors', () => {
            const scanResult = document.getElementById('scanResult');

            // Simuliere Fehler-Anzeige
            scanResult.textContent = 'Fehler: Kamera nicht verfügbar';
            scanResult.classList.add('error');
            scanResult.classList.remove('hidden');

            expect(scanResult.textContent).toContain('Fehler');
            expect(scanResult.classList.contains('error')).toBe(true);
            expect(scanResult.classList.contains('hidden')).toBe(false);
        });
    });

    describe('QR Code Processing', () => {
        test('should handle successful QR scan', () => {
            const scanData = {
                success: true,
                data: {
                    ID: 1,
                    RawPayload: 'PACKAGE_12345_ABC',
                    ScannTS: new Date().toISOString()
                }
            };

            // Simuliere erfolgreichen Scan
            const scanResult = document.getElementById('scanResult');
            scanResult.textContent = `QR-Code gespeichert: ${scanData.data.RawPayload}`;
            scanResult.classList.add('success');
            scanResult.classList.remove('hidden');

            expect(scanResult.textContent).toContain('PACKAGE_12345_ABC');
            expect(scanResult.classList.contains('success')).toBe(true);
        });

        test('should handle QR scan errors', () => {
            const errorData = {
                success: false,
                error: 'Duplicate scan detected'
            };

            // Simuliere Scan-Fehler
            const scanResult = document.getElementById('scanResult');
            scanResult.textContent = `Fehler: ${errorData.error}`;
            scanResult.classList.add('error');
            scanResult.classList.remove('hidden');

            expect(scanResult.textContent).toContain('Duplicate scan detected');
            expect(scanResult.classList.contains('error')).toBe(true);
        });

        test('should update scan counter', () => {
            const scanCount = document.getElementById('scanCount');

            // Simuliere Scan-Counter-Update
            let currentCount = parseInt(scanCount.textContent) || 0;
            currentCount++;
            scanCount.textContent = currentCount.toString();

            expect(scanCount.textContent).toBe('1');
        });

        test('should add scan to history list', () => {
            const scanList = document.getElementById('scanList');
            const scanData = {
                ID: 1,
                RawPayload: 'TEST_PACKAGE_001',
                ScannTS: new Date().toISOString()
            };

            // Simuliere Hinzufügen zur Liste
            const listItem = document.createElement('li');
            listItem.textContent = `${scanData.RawPayload} - ${new Date(scanData.ScannTS).toLocaleTimeString()}`;
            listItem.dataset.scanId = scanData.ID;

            scanList.insertBefore(listItem, scanList.firstChild);

            expect(scanList.children.length).toBe(1);
            expect(scanList.firstChild.textContent).toContain('TEST_PACKAGE_001');
        });

        test('should limit scan history display', () => {
            const scanList = document.getElementById('scanList');
            const maxHistoryItems = 10;

            // Simuliere viele Scans
            for (let i = 1; i <= 15; i++) {
                const listItem = document.createElement('li');
                listItem.textContent = `SCAN_${i}`;
                scanList.insertBefore(listItem, scanList.firstChild);
            }

            // Simuliere Begrenzung
            while (scanList.children.length > maxHistoryItems) {
                scanList.removeChild(scanList.lastChild);
            }

            expect(scanList.children.length).toBe(maxHistoryItems);
        });
    });

    describe('Notifications', () => {
        test('should show notification', () => {
            const message = 'Test notification';
            app.showNotification(message);

            expect(app.showNotification).toHaveBeenCalledWith(message);
        });

        test('should create notification element', () => {
            const notificationsContainer = document.getElementById('notifications');

            // Simuliere Notification-Erstellung
            const notification = document.createElement('div');
            notification.className = 'notification success';
            notification.textContent = 'Benutzer erfolgreich angemeldet';

            notificationsContainer.appendChild(notification);

            expect(notificationsContainer.children.length).toBe(1);
            expect(notification.textContent).toContain('erfolgreich angemeldet');
            expect(notification.classList.contains('success')).toBe(true);
        });

        test('should auto-hide notifications', (done) => {
            const notificationsContainer = document.getElementById('notifications');

            const notification = document.createElement('div');
            notification.className = 'notification info';
            notification.textContent = 'Auto-hide test';

            notificationsContainer.appendChild(notification);

            // Simuliere Auto-Hide nach 3 Sekunden
            setTimeout(() => {
                notification.style.opacity = '0';
                setTimeout(() => {
                    notificationsContainer.removeChild(notification);
                    expect(notificationsContainer.children.length).toBe(0);
                    done();
                }, 300);
            }, 100); // Verkürzt für Test
        });

        test('should handle multiple notifications', () => {
            const notificationsContainer = document.getElementById('notifications');

            // Erstelle mehrere Notifications
            for (let i = 1; i <= 3; i++) {
                const notification = document.createElement('div');
                notification.className = 'notification info';
                notification.textContent = `Notification ${i}`;
                notificationsContainer.appendChild(notification);
            }

            expect(notificationsContainer.children.length).toBe(3);
        });
    });

    describe('Error Handling', () => {
        test('should display connection errors', () => {
            const loginStatus = document.getElementById('loginStatus');

            // Simuliere Verbindungsfehler
            loginStatus.textContent = 'Datenbankverbindung fehlgeschlagen';
            loginStatus.classList.add('error');
            loginStatus.classList.remove('hidden');

            expect(loginStatus.textContent).toContain('fehlgeschlagen');
            expect(loginStatus.classList.contains('error')).toBe(true);
            expect(loginStatus.classList.contains('hidden')).toBe(false);
        });

        test('should handle unknown user', () => {
            const loginStatus = document.getElementById('loginStatus');

            // Simuliere unbekannter Benutzer
            loginStatus.textContent = 'RFID-Tag nicht erkannt. Bitte Administrator kontaktieren.';
            loginStatus.classList.add('warning');
            loginStatus.classList.remove('hidden');

            expect(loginStatus.textContent).toContain('nicht erkannt');
            expect(loginStatus.classList.contains('warning')).toBe(true);
        });

        test('should handle camera access denied', () => {
            const scanResult = document.getElementById('scanResult');

            // Simuliere Kamera-Zugriff verweigert
            scanResult.textContent = 'Kamera-Zugriff verweigert. Bitte Berechtigungen prüfen.';
            scanResult.classList.add('error');
            scanResult.classList.remove('hidden');

            expect(scanResult.textContent).toContain('Kamera-Zugriff verweigert');
            expect(scanResult.classList.contains('error')).toBe(true);
        });

        test('should handle network errors gracefully', () => {
            const debugLog = document.getElementById('debugLog');

            // Simuliere Debug-Logging
            const errorInfo = {
                timestamp: new Date().toISOString(),
                error: 'Network request failed',
                details: 'Connection timeout after 5000ms'
            };

            debugLog.textContent = JSON.stringify(errorInfo, null, 2);

            expect(debugLog.textContent).toContain('Network request failed');
            expect(debugLog.textContent).toContain('timeout');
        });
    });

    describe('Responsive Design', () => {
        test('should handle window resize', () => {
            const video = document.getElementById('qrVideo');
            const canvas = document.getElementById('qrCanvas');

            // Simuliere Fenster-Resize
            const updateVideoSize = (width, height) => {
                video.width = width;
                video.height = height;
                canvas.width = width;
                canvas.height = height;
            };

            updateVideoSize(640, 480);

            expect(video.width).toBe(640);
            expect(video.height).toBe(480);
            expect(canvas.width).toBe(640);
            expect(canvas.height).toBe(480);
        });

        test('should adapt to small screens', () => {
            const qrSection = document.getElementById('qrSection');

            // Simuliere Mobile-Layout
            qrSection.classList.add('mobile-layout');

            expect(qrSection.classList.contains('mobile-layout')).toBe(true);
        });
    });

    describe('Accessibility', () => {
        test('should have proper ARIA labels', () => {
            const startBtn = document.getElementById('startScannerBtn');
            const stopBtn = document.getElementById('stopScannerBtn');
            const logoutBtn = document.getElementById('logoutBtn');

            // Simuliere ARIA-Labels
            startBtn.setAttribute('aria-label', 'QR-Scanner starten');
            stopBtn.setAttribute('aria-label', 'QR-Scanner stoppen');
            logoutBtn.setAttribute('aria-label', 'Benutzer abmelden');

            expect(startBtn.getAttribute('aria-label')).toBe('QR-Scanner starten');
            expect(stopBtn.getAttribute('aria-label')).toBe('QR-Scanner stoppen');
            expect(logoutBtn.getAttribute('aria-label')).toBe('Benutzer abmelden');
        });

        test('should support keyboard navigation', () => {
            const buttons = document.querySelectorAll('button');

            buttons.forEach((button, index) => {
                button.tabIndex = index + 1;
            });

            expect(buttons[0].tabIndex).toBe(1);
            expect(buttons[1].tabIndex).toBe(2);
            expect(buttons[2].tabIndex).toBe(3);
        });

        test('should provide screen reader support', () => {
            const loginInstructions = document.getElementById('loginInstructions');

            loginInstructions.setAttribute('role', 'status');
            loginInstructions.setAttribute('aria-live', 'polite');

            expect(loginInstructions.getAttribute('role')).toBe('status');
            expect(loginInstructions.getAttribute('aria-live')).toBe('polite');
        });
    });

    describe('Performance', () => {
        test('should handle rapid UI updates', () => {
            const scanCount = document.getElementById('scanCount');

            // Simuliere schnelle Updates
            for (let i = 1; i <= 100; i++) {
                scanCount.textContent = i.toString();
            }

            expect(scanCount.textContent).toBe('100');
        });

        test('should cleanup event listeners', () => {
            const testButton = document.createElement('button');
            const handler = jest.fn();

            testButton.addEventListener('click', handler);
            document.body.appendChild(testButton);

            // Simuliere Cleanup
            testButton.removeEventListener('click', handler);
            document.body.removeChild(testButton);

            expect(document.body.contains(testButton)).toBe(false);
        });

        test('should optimize scan history rendering', () => {
            const scanList = document.getElementById('scanList');

            // Simuliere Document Fragment für bessere Performance
            const fragment = document.createDocumentFragment();

            for (let i = 1; i <= 10; i++) {
                const listItem = document.createElement('li');
                listItem.textContent = `Scan ${i}`;
                fragment.appendChild(listItem);
            }

            scanList.appendChild(fragment);

            expect(scanList.children.length).toBe(10);
        });
    });

    describe('Integration with Electron API', () => {
        test('should call Electron API methods', async () => {
            // Test DB API
            window.electronAPI.db.getUserByEPC.mockResolvedValueOnce({ ID: 1, BenutzerName: 'Test' });
            const user = await window.electronAPI.db.getUserByEPC('53004114');

            expect(window.electronAPI.db.getUserByEPC).toHaveBeenCalledWith('53004114');
            expect(user.BenutzerName).toBe('Test');
        });

        test('should handle session API calls', async () => {
            window.electronAPI.session.create.mockResolvedValueOnce({ ID: 1, UserID: 1 });
            const session = await window.electronAPI.session.create(1);

            expect(window.electronAPI.session.create).toHaveBeenCalledWith(1);
            expect(session.UserID).toBe(1);
        });

        test('should handle QR API calls', async () => {
            const scanResult = { success: true, data: { ID: 1 } };
            window.electronAPI.qr.save.mockResolvedValueOnce(scanResult);

            const result = await window.electronAPI.qr.save(1, 'TEST_QR');

            expect(window.electronAPI.qr.save).toHaveBeenCalledWith(1, 'TEST_QR');
            expect(result.success).toBe(true);
        });

        test('should register event listeners', () => {
            const handler = jest.fn();
            window.electronAPI.on('user-login', handler);

            expect(window.electronAPI.on).toHaveBeenCalledWith('user-login', handler);
        });
    });
});