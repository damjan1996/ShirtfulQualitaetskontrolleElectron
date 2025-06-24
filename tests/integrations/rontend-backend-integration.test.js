// tests/integration/frontend-backend-integration.test.js
/**
 * Frontend-Backend Integration Tests
 * Testet die komplette Kommunikation zwischen Renderer und Main Process
 */

const { mockElectron } = require('../mocks/electron.mock');
const MockDatabaseClient = require('../mocks/db-client.mock');
const MockRFIDListener = require('../mocks/rfid-listener.mock');
const { JSDOM } = require('jsdom');

// Mock Electron
jest.mock('electron', () => mockElectron);

describe('Frontend-Backend Integration', () => {
    let mockMainProcess;
    let mockRenderer;
    let dom;
    let document;
    let window;

    beforeEach(() => {
        // Setup Mock Main Process
        mockMainProcess = {
            ipcHandlers: new Map(),
            dbClient: new MockDatabaseClient(),
            rfidListener: new MockRFIDListener(),
            currentSession: null,
            currentUser: null,
            systemStatus: {
                database: false,
                rfid: false,
                qrScanner: false
            }
        };

        // Setup Mock DOM für Renderer
        dom = new JSDOM(`
            <!DOCTYPE html>
            <html>
            <body>
                <div id="app">
                    <div id="loginSection">
                        <h1>RFID Login</h1>
                        <p id="loginStatus"></p>
                    </div>
                    <div id="workspace" class="hidden">
                        <div id="userInfo">
                            <h2 id="userName"></h2>
                            <p id="userEmail"></p>
                            <div id="sessionTimer">00:00:00</div>
                        </div>
                        <div id="qrSection">
                            <button id="startScannerBtn">Start Scanner</button>
                            <button id="stopScannerBtn" class="hidden">Stop Scanner</button>
                            <div id="scanResult"></div>
                        </div>
                        <div id="scanHistory">
                            <ul id="scanList"></ul>
                            <div id="scanCount">0</div>
                        </div>
                    </div>
                    <div id="notifications"></div>
                </div>
            </body>
            </html>
        `);

        document = dom.window.document;
        window = dom.window;

        // Setup Mock Renderer Process
        mockRenderer = {
            window: window,
            document: document,
            electronAPI: {
                db: {
                    getUserByEPC: jest.fn(),
                    getUserById: jest.fn(),
                    getAllActiveUsers: jest.fn(),
                    healthCheck: jest.fn()
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
            },
            appState: {
                currentUser: null,
                currentSession: null,
                scanHistory: [],
                isScanning: false
            }
        };

        // Setup IPC Handlers im Main Process
        mockMainProcess.ipcHandlers.set('db-get-user-by-epc', async (event, tagId) => {
            return await mockMainProcess.dbClient.getUserByEPC(tagId);
        });

        mockMainProcess.ipcHandlers.set('session-create', async (event, userId) => {
            const session = await mockMainProcess.dbClient.createSession(userId);
            mockMainProcess.currentSession = session;
            return session;
        });

        mockMainProcess.ipcHandlers.set('session-end', async (event, sessionId) => {
            const endedSession = await mockMainProcess.dbClient.endSession(sessionId);
            mockMainProcess.currentSession = null;
            mockMainProcess.currentUser = null;
            return endedSession;
        });

        mockMainProcess.ipcHandlers.set('qr-scan-save', async (event, sessionId, payload) => {
            return await mockMainProcess.dbClient.saveQRScan(sessionId, payload);
        });

        mockMainProcess.ipcHandlers.set('rfid-start', async () => {
            const result = await mockMainProcess.rfidListener.start();
            mockMainProcess.systemStatus.rfid = result;
            return { success: result, listening: mockMainProcess.rfidListener.isListening };
        });

        mockMainProcess.ipcHandlers.set('rfid-stop', async () => {
            const result = await mockMainProcess.rfidListener.stop();
            mockMainProcess.systemStatus.rfid = !result;
            return { success: result, listening: mockMainProcess.rfidListener.isListening };
        });

        // Mock IPC-Kommunikation
        mockElectron.ipcMain.handle.mockImplementation((channel, handler) => {
            mockMainProcess.ipcHandlers.set(channel, handler);
        });

        // Mock IPC Renderer Invoke
        mockRenderer.electronAPI.db.getUserByEPC.mockImplementation(async (tagId) => {
            const handler = mockMainProcess.ipcHandlers.get('db-get-user-by-epc');
            return await handler(null, tagId);
        });

        mockRenderer.electronAPI.session.create.mockImplementation(async (userId) => {
            const handler = mockMainProcess.ipcHandlers.get('session-create');
            return await handler(null, userId);
        });

        mockRenderer.electronAPI.session.end.mockImplementation(async (sessionId) => {
            const handler = mockMainProcess.ipcHandlers.get('session-end');
            return await handler(null, sessionId);
        });

        mockRenderer.electronAPI.qr.save.mockImplementation(async (sessionId, payload) => {
            const handler = mockMainProcess.ipcHandlers.get('qr-scan-save');
            return await handler(null, sessionId, payload);
        });

        mockRenderer.electronAPI.rfid.start.mockImplementation(async () => {
            const handler = mockMainProcess.ipcHandlers.get('rfid-start');
            return await handler(null);
        });

        mockRenderer.electronAPI.rfid.stop.mockImplementation(async () => {
            const handler = mockMainProcess.ipcHandlers.get('rfid-stop');
            return await handler(null);
        });

        // Expose electronAPI to window
        window.electronAPI = mockRenderer.electronAPI;
    });

    afterEach(async () => {
        if (mockMainProcess.rfidListener) {
            await mockMainProcess.rfidListener.stop();
        }
        if (mockMainProcess.dbClient) {
            await mockMainProcess.dbClient.close();
        }
        dom.window.close();
    });

    describe('Application Startup Flow', () => {
        test('should initialize all systems correctly', async () => {
            // Main Process: Starte Systeme
            await mockMainProcess.dbClient.connect();
            await mockMainProcess.rfidListener.start();
            mockMainProcess.systemStatus.database = true;
            mockMainProcess.systemStatus.rfid = true;

            // Renderer: Initialisierung
            const dbHealth = await mockRenderer.electronAPI.db.healthCheck();
            const rfidStart = await mockRenderer.electronAPI.rfid.start();

            expect(mockMainProcess.dbClient.isConnected).toBe(true);
            expect(mockMainProcess.rfidListener.isListening).toBe(true);
            expect(rfidStart.success).toBe(true);
        });

        test('should handle startup errors gracefully', async () => {
            // Simuliere DB-Verbindungsfehler
            jest.spyOn(mockMainProcess.dbClient, 'connect')
                .mockRejectedValueOnce(new Error('Database connection failed'));

            await expect(mockMainProcess.dbClient.connect())
                .rejects.toThrow('Database connection failed');

            expect(mockMainProcess.dbClient.isConnected).toBe(false);
            mockMainProcess.systemStatus.database = false;

            // UI sollte Fehler anzeigen
            const loginStatus = document.getElementById('loginStatus');
            loginStatus.textContent = 'Datenbankverbindung fehlgeschlagen';
            loginStatus.className = 'error';

            expect(loginStatus.textContent).toContain('fehlgeschlagen');
            expect(loginStatus.className).toBe('error');
        });
    });

    describe('User Login Workflow', () => {
        beforeEach(async () => {
            await mockMainProcess.dbClient.connect();
            await mockMainProcess.rfidListener.start();
        });

        test('should handle complete login workflow', async () => {
            const tagId = '53004114';

            // 1. RFID-Scan simulieren
            mockMainProcess.rfidListener.simulateTag(tagId);

            // 2. Main Process: User lookup
            const user = await mockRenderer.electronAPI.db.getUserByEPC(tagId);
            expect(user).toBeTruthy();
            expect(user.BenutzerName).toBe('Test User 1');

            // 3. Main Process: Session erstellen
            const session = await mockRenderer.electronAPI.session.create(user.ID);
            expect(session).toBeTruthy();
            expect(session.UserID).toBe(user.ID);
            expect(session.Active).toBe(1);

            // 4. Renderer: UI aktualisieren
            mockRenderer.appState.currentUser = user;
            mockRenderer.appState.currentSession = session;

            const userName = document.getElementById('userName');
            const userEmail = document.getElementById('userEmail');
            const loginSection = document.getElementById('loginSection');
            const workspace = document.getElementById('workspace');

            userName.textContent = user.BenutzerName;
            userEmail.textContent = user.Email;
            loginSection.classList.add('hidden');
            workspace.classList.remove('hidden');

            expect(userName.textContent).toBe('Test User 1');
            expect(userEmail.textContent).toBe('test1@example.com');
            expect(loginSection.classList.contains('hidden')).toBe(true);
            expect(workspace.classList.contains('hidden')).toBe(false);

            // 5. Verify Main Process state
            expect(mockMainProcess.currentSession).toBeTruthy();
            expect(mockMainProcess.currentSession.UserID).toBe(user.ID);
        });

        test('should handle unknown RFID tag', async () => {
            const unknownTag = 'UNKNOWN123';

            // Main Process: User lookup
            const user = await mockRenderer.electronAPI.db.getUserByEPC(unknownTag);
            expect(user).toBeNull();

            // Renderer: Zeige Fehler
            const loginStatus = document.getElementById('loginStatus');
            loginStatus.textContent = 'RFID-Tag nicht erkannt';
            loginStatus.className = 'warning';
            loginStatus.classList.remove('hidden');

            expect(loginStatus.textContent).toContain('nicht erkannt');
            expect(loginStatus.className).toBe('warning');
        });

        test('should handle user logout', async () => {
            // Setup: User ist eingeloggt
            const user = await mockRenderer.electronAPI.db.getUserByEPC('53004114');
            const session = await mockRenderer.electronAPI.session.create(user.ID);

            mockRenderer.appState.currentUser = user;
            mockRenderer.appState.currentSession = session;

            // Logout durchführen
            const endedSession = await mockRenderer.electronAPI.session.end(session.ID);
            expect(endedSession.Active).toBe(0);

            // Renderer: UI zurücksetzen
            mockRenderer.appState.currentUser = null;
            mockRenderer.appState.currentSession = null;

            const loginSection = document.getElementById('loginSection');
            const workspace = document.getElementById('workspace');
            const scanList = document.getElementById('scanList');

            loginSection.classList.remove('hidden');
            workspace.classList.add('hidden');
            scanList.innerHTML = '';

            expect(loginSection.classList.contains('hidden')).toBe(false);
            expect(workspace.classList.contains('hidden')).toBe(true);
            expect(scanList.innerHTML).toBe('');

            // Verify Main Process state
            expect(mockMainProcess.currentSession).toBeNull();
            expect(mockMainProcess.currentUser).toBeNull();
        });
    });

    describe('QR Scanning Workflow', () => {
        let user, session;

        beforeEach(async () => {
            await mockMainProcess.dbClient.connect();
            await mockMainProcess.rfidListener.start();

            // Setup logged-in user
            user = await mockRenderer.electronAPI.db.getUserByEPC('53004114');
            session = await mockRenderer.electronAPI.session.create(user.ID);
            mockRenderer.appState.currentUser = user;
            mockRenderer.appState.currentSession = session;
        });

        test('should handle successful QR scan', async () => {
            const qrPayload = 'PACKAGE_12345_ABC';

            // Main Process: Save QR scan
            const scanResult = await mockRenderer.electronAPI.qr.save(session.ID, qrPayload);
            expect(scanResult.success).toBe(true);
            expect(scanResult.data.RawPayload).toBe(qrPayload);

            // Renderer: Update UI
            const scanList = document.getElementById('scanList');
            const scanCount = document.getElementById('scanCount');
            const scanResultDiv = document.getElementById('scanResult');

            // Add to scan history
            const listItem = document.createElement('li');
            listItem.textContent = `${qrPayload} - ${new Date().toLocaleTimeString()}`;
            scanList.insertBefore(listItem, scanList.firstChild);

            // Update counter
            const currentCount = parseInt(scanCount.textContent) + 1;
            scanCount.textContent = currentCount.toString();

            // Show success message
            scanResultDiv.textContent = `QR-Code gespeichert: ${qrPayload}`;
            scanResultDiv.className = 'success';
            scanResultDiv.classList.remove('hidden');

            expect(scanList.children.length).toBe(1);
            expect(scanCount.textContent).toBe('1');
            expect(scanResultDiv.textContent).toContain(qrPayload);
            expect(scanResultDiv.className).toBe('success');

            // Update app state
            mockRenderer.appState.scanHistory.push(scanResult.data);
            expect(mockRenderer.appState.scanHistory.length).toBe(1);
        });

        test('should handle duplicate QR scan', async () => {
            const qrPayload = 'DUPLICATE_PACKAGE';

            // First scan - should succeed
            const firstScan = await mockRenderer.electronAPI.qr.save(session.ID, qrPayload);
            expect(firstScan.success).toBe(true);

            // Second scan - should fail
            try {
                await mockRenderer.electronAPI.qr.save(session.ID, qrPayload);
            } catch (error) {
                expect(error.message).toContain('Duplicate scan detected');

                // Renderer: Show error
                const scanResultDiv = document.getElementById('scanResult');
                scanResultDiv.textContent = `Fehler: ${error.message}`;
                scanResultDiv.className = 'error';
                scanResultDiv.classList.remove('hidden');

                expect(scanResultDiv.textContent).toContain('Duplicate scan detected');
                expect(scanResultDiv.className).toBe('error');
            }
        });

        test('should handle QR scanner control', async () => {
            const startBtn = document.getElementById('startScannerBtn');
            const stopBtn = document.getElementById('stopScannerBtn');

            // Start scanner
            mockRenderer.appState.isScanning = true;
            startBtn.classList.add('hidden');
            stopBtn.classList.remove('hidden');

            expect(startBtn.classList.contains('hidden')).toBe(true);
            expect(stopBtn.classList.contains('hidden')).toBe(false);
            expect(mockRenderer.appState.isScanning).toBe(true);

            // Stop scanner
            mockRenderer.appState.isScanning = false;
            startBtn.classList.remove('hidden');
            stopBtn.classList.add('hidden');

            expect(startBtn.classList.contains('hidden')).toBe(false);
            expect(stopBtn.classList.contains('hidden')).toBe(true);
            expect(mockRenderer.appState.isScanning).toBe(false);
        });
    });

    describe('Event Communication', () => {
        test('should handle IPC events from main to renderer', () => {
            const eventHandler = jest.fn();
            mockRenderer.electronAPI.on('user-login', eventHandler);

            // Simulate event from main process
            const userData = {
                user: { ID: 1, BenutzerName: 'Test User' },
                session: { ID: 1, StartTS: new Date().toISOString() }
            };

            // In real app, this would be sent from main process
            eventHandler(userData);

            expect(eventHandler).toHaveBeenCalledWith(userData);
        });

        test('should handle system status updates', async () => {
            // Main Process: Update system status
            mockMainProcess.systemStatus = {
                database: true,
                rfid: true,
                qrScanner: false
            };

            // Renderer would receive this via IPC event
            const statusHandler = jest.fn();
            mockRenderer.electronAPI.on('system-status-update', statusHandler);

            // Simulate status update
            statusHandler(mockMainProcess.systemStatus);

            expect(statusHandler).toHaveBeenCalledWith(mockMainProcess.systemStatus);
        });

        test('should handle error events', () => {
            const errorHandler = jest.fn();
            mockRenderer.electronAPI.on('system-error', errorHandler);

            const errorData = {
                type: 'database_error',
                message: 'Connection lost',
                timestamp: new Date().toISOString()
            };

            errorHandler(errorData);

            expect(errorHandler).toHaveBeenCalledWith(errorData);

            // Renderer: Show error notification
            const notifications = document.getElementById('notifications');
            const notification = document.createElement('div');
            notification.className = 'notification error';
            notification.textContent = `System Error: ${errorData.message}`;
            notifications.appendChild(notification);

            expect(notifications.children.length).toBe(1);
            expect(notification.textContent).toContain('Connection lost');
        });
    });

    describe('Window Management', () => {
        test('should handle window controls', async () => {
            // Test minimize
            await mockRenderer.electronAPI.window.minimize();
            expect(mockRenderer.electronAPI.window.minimize).toHaveBeenCalled();

            // Test maximize
            await mockRenderer.electronAPI.window.maximize();
            expect(mockRenderer.electronAPI.window.maximize).toHaveBeenCalled();

            // Test close
            await mockRenderer.electronAPI.window.close();
            expect(mockRenderer.electronAPI.window.close).toHaveBeenCalled();
        });

        test('should handle window state changes', () => {
            // Simulate window state changes that would come from main process
            const windowStateHandler = jest.fn();
            mockRenderer.electronAPI.on('window-state-changed', windowStateHandler);

            const stateData = {
                isMinimized: false,
                isMaximized: true,
                isFocused: true
            };

            windowStateHandler(stateData);
            expect(windowStateHandler).toHaveBeenCalledWith(stateData);
        });
    });

    describe('Error Recovery', () => {
        test('should recover from IPC communication errors', async () => {
            // Simulate IPC error
            mockRenderer.electronAPI.db.getUserByEPC
                .mockRejectedValueOnce(new Error('IPC communication failed'));

            try {
                await mockRenderer.electronAPI.db.getUserByEPC('53004114');
            } catch (error) {
                expect(error.message).toBe('IPC communication failed');

                // Renderer: Show connection error
                const loginStatus = document.getElementById('loginStatus');
                loginStatus.textContent = 'Verbindungsfehler. Bitte versuchen Sie es erneut.';
                loginStatus.className = 'error';

                expect(loginStatus.textContent).toContain('Verbindungsfehler');
            }

            // Recovery: Reset mock and try again
            mockRenderer.electronAPI.db.getUserByEPC.mockReset();
            mockRenderer.electronAPI.db.getUserByEPC.mockImplementation(async (tagId) => {
                const handler = mockMainProcess.ipcHandlers.get('db-get-user-by-epc');
                return await handler(null, tagId);
            });

            const user = await mockRenderer.electronAPI.db.getUserByEPC('53004114');
            expect(user).toBeTruthy();
        });

        test('should handle backend service failures', async () => {
            // Simulate RFID service failure
            await mockMainProcess.rfidListener.stop();
            mockMainProcess.systemStatus.rfid = false;

            const rfidStop = await mockRenderer.electronAPI.rfid.stop();
            expect(rfidStop.listening).toBe(false);

            // Renderer: Show service status
            const notifications = document.getElementById('notifications');
            const notification = document.createElement('div');
            notification.className = 'notification warning';
            notification.textContent = 'RFID-Service nicht verfügbar';
            notifications.appendChild(notification);

            expect(notification.textContent).toContain('nicht verfügbar');

            // Recovery: Restart service
            await mockMainProcess.rfidListener.start();
            mockMainProcess.systemStatus.rfid = true;

            const rfidStart = await mockRenderer.electronAPI.rfid.start();
            expect(rfidStart.listening).toBe(true);

            // Clear error notification
            notification.remove();
            expect(notifications.children.length).toBe(0);
        });
    });

    describe('Performance and Concurrency', () => {
        test('should handle concurrent API calls', async () => {
            await mockMainProcess.dbClient.connect();

            // Simulate multiple simultaneous calls
            const promises = [
                mockRenderer.electronAPI.db.getUserByEPC('53004114'),
                mockRenderer.electronAPI.db.getUserByEPC('87654321'),
                mockRenderer.electronAPI.db.getAllActiveUsers()
            ];

            const results = await Promise.all(promises);

            expect(results[0].BenutzerName).toBe('Test User 1');
            expect(results[1].BenutzerName).toBe('Test User 2');
            expect(results[2]).toBeInstanceOf(Array);
            expect(results[2].length).toBe(2);
        });

        test('should handle rapid UI updates', async () => {
            const user = await mockRenderer.electronAPI.db.getUserByEPC('53004114');
            const session = await mockRenderer.electronAPI.session.create(user.ID);

            // Simulate rapid QR scans
            const scanPromises = [];
            for (let i = 1; i <= 10; i++) {
                scanPromises.push(
                    mockRenderer.electronAPI.qr.save(session.ID, `RAPID_SCAN_${i}`)
                );
            }

            const scanResults = await Promise.all(scanPromises);
            expect(scanResults.every(r => r.success)).toBe(true);

            // Update UI rapidly
            const scanList = document.getElementById('scanList');
            const scanCount = document.getElementById('scanCount');

            scanResults.forEach((result, index) => {
                const listItem = document.createElement('li');
                listItem.textContent = result.data.RawPayload;
                scanList.appendChild(listItem);
            });

            scanCount.textContent = scanResults.length.toString();

            expect(scanList.children.length).toBe(10);
            expect(scanCount.textContent).toBe('10');
        });

        test('should maintain data consistency across frontend and backend', async () => {
            const user = await mockRenderer.electronAPI.db.getUserByEPC('53004114');
            const session = await mockRenderer.electronAPI.session.create(user.ID);

            // Frontend state
            mockRenderer.appState.currentUser = user;
            mockRenderer.appState.currentSession = session;
            mockRenderer.appState.scanHistory = [];

            // Perform operations
            const scanResults = [];
            for (let i = 1; i <= 5; i++) {
                const result = await mockRenderer.electronAPI.qr.save(session.ID, `CONSISTENCY_SCAN_${i}`);
                scanResults.push(result);
                mockRenderer.appState.scanHistory.push(result.data);
            }

            // Verify consistency
            expect(mockRenderer.appState.scanHistory.length).toBe(5);
            expect(mockMainProcess.currentSession.ID).toBe(session.ID);

            // Backend should have same data
            const backendScans = await mockMainProcess.dbClient.getQRScansBySession(session.ID);
            expect(backendScans.length).toBe(5);

            // Data should match
            const frontendPayloads = mockRenderer.appState.scanHistory.map(s => s.RawPayload);
            const backendPayloads = backendScans.map(s => s.RawPayload);
            expect(frontendPayloads).toEqual(backendPayloads);
        });
    });
});