const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
require('dotenv').config();

// Import our modules
const RFIDListener = require('./rfid/rfid-listener-keyboard');
const DatabaseClient = require('./db/db-client');

class MainApplication {
    constructor() {
        this.mainWindow = null;
        this.rfidListener = null;
        this.dbClient = null;
        this.activeSessions = new Map(); // userId -> sessionData
        this.systemStatus = {
            database: false,
            rfid: false,
            errors: []
        };

        this.initializeApp();
    }

    initializeApp() {
        // App ready event
        app.whenReady().then(() => {
            this.createMainWindow();
            this.initializeComponents();

            app.on('activate', () => {
                if (BrowserWindow.getAllWindows().length === 0) {
                    this.createMainWindow();
                }
            });
        });

        // App window events
        app.on('window-all-closed', () => {
            this.cleanup();
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });

        app.on('before-quit', () => {
            this.cleanup();
        });

        // Setup IPC handlers
        this.setupIpcHandlers();
    }

    createMainWindow() {
        this.mainWindow = new BrowserWindow({
            width: parseInt(process.env.UI_WINDOW_WIDTH) || 1200,
            height: parseInt(process.env.UI_WINDOW_HEIGHT) || 800,
            minWidth: parseInt(process.env.UI_MIN_WIDTH) || 1000,
            minHeight: parseInt(process.env.UI_MIN_HEIGHT) || 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: path.join(__dirname, 'preload.js'),
                enableRemoteModule: false
            },
            show: false,
            icon: path.join(__dirname, 'assets/icon.png'),
            title: 'RFID QR Wareneingang System'
        });

        // Load the renderer
        this.mainWindow.loadFile('renderer/index.html');

        // Show when ready
        this.mainWindow.once('ready-to-show', () => {
            this.mainWindow.show();

            // Development mode
            if (process.env.NODE_ENV === 'development' || process.argv.includes('--dev')) {
                this.mainWindow.webContents.openDevTools();
            }
        });

        // Handle window closed
        this.mainWindow.on('closed', () => {
            this.mainWindow = null;
        });
    }

    async initializeComponents() {
        console.log('🚀 Starting component initialization...');

        // Initialize database first
        await this.initializeDatabase();

        // Initialize RFID listener (with fallback handling)
        await this.initializeRFID();

        // Notify renderer about system status
        this.sendToRenderer('system-ready', {
            database: this.systemStatus.database,
            rfid: this.systemStatus.rfid,
            errors: this.systemStatus.errors,
            timestamp: new Date().toISOString()
        });

        if (this.systemStatus.database) {
            console.log('✅ System initialization completed');
        } else {
            console.error('❌ System initialization failed - database connection required');
        }
    }

    async initializeDatabase() {
        try {
            console.log('📊 Initializing database connection...');
            this.dbClient = new DatabaseClient();
            await this.dbClient.connect();

            this.systemStatus.database = true;
            console.log('✅ Database initialized successfully');

        } catch (error) {
            this.systemStatus.database = false;
            this.systemStatus.errors.push(`Database: ${error.message}`);
            console.error('❌ Database initialization failed:', error);

            // Show error dialog for critical database failure
            if (this.mainWindow) {
                dialog.showErrorBox(
                    'Database Connection Failed',
                    `Failed to connect to database: ${error.message}\n\nPlease check your .env configuration and try again.`
                );
            }
        }
    }

    async initializeRFID() {
        try {
            console.log('🏷️ Initializing RFID listener...');

            this.rfidListener = new RFIDListener((tagId) => {
                this.handleRFIDScan(tagId);
            });

            const started = await this.rfidListener.start();

            if (started) {
                this.systemStatus.rfid = true;
                console.log('✅ RFID listener initialized successfully');
            } else {
                throw new Error('RFID listener failed to start');
            }

        } catch (error) {
            this.systemStatus.rfid = false;
            this.systemStatus.errors.push(`RFID: ${error.message}`);
            console.error('❌ RFID initialization failed:', error);

            // Try to provide helpful suggestions
            console.log('💡 RFID Troubleshooting:');
            console.log('   1. Ensure RFID reader is connected via USB');
            console.log('   2. Check if reader is configured as HID keyboard');
            console.log('   3. Try rebuilding native modules: npm run rebuild');
            console.log('   4. Consider using keyboard listener alternative');

            // Don't block the application for RFID failures - it can run without RFID
            // The UI should show that RFID is not available
        }
    }

    setupIpcHandlers() {
        // Database operations
        ipcMain.handle('db-query', async (event, query, params) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    throw new Error('Database not connected');
                }
                return await this.dbClient.query(query, params);
            } catch (error) {
                console.error('Database query error:', error);
                throw error;
            }
        });

        ipcMain.handle('db-get-user-by-epc', async (event, tagId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return null;
                }

                const epcDecimal = parseInt(tagId, 16);
                const query = `
                    SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                    FROM dbo.ScannBenutzer
                    WHERE EPC = ? AND xStatus = 0
                `;
                const result = await this.dbClient.query(query, [epcDecimal]);
                return result.recordset.length > 0 ? result.recordset[0] : null;
            } catch (error) {
                console.error('Get user by EPC error:', error);
                return null;
            }
        });

        // Session management
        ipcMain.handle('session-create', async (event, userId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    throw new Error('Database not connected');
                }

                // Close existing session if any
                await this.endExistingSession(userId);

                // Create new session
                const query = `
                    INSERT INTO dbo.Sessions (UserID, StartTS, Active)
                    OUTPUT INSERTED.ID, INSERTED.StartTS
                    VALUES (?, SYSDATETIME(), 1)
                `;
                const result = await this.dbClient.query(query, [userId]);

                if (result.recordset.length > 0) {
                    const session = result.recordset[0];

                    // Store in memory
                    this.activeSessions.set(userId, {
                        sessionId: session.ID,
                        userId: userId,
                        startTime: session.StartTS,
                        scanCount: 0
                    });

                    return session;
                }
                return null;
            } catch (error) {
                console.error('Session create error:', error);
                return null;
            }
        });

        ipcMain.handle('session-end', async (event, sessionId) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    return false;
                }

                const query = `
                    UPDATE dbo.Sessions
                    SET EndTS = SYSDATETIME(), Active = 0
                    WHERE ID = ? AND Active = 1
                `;
                await this.dbClient.query(query, [sessionId]);

                // Remove from memory
                for (const [userId, sessionData] of this.activeSessions.entries()) {
                    if (sessionData.sessionId === sessionId) {
                        this.activeSessions.delete(userId);
                        break;
                    }
                }

                return true;
            } catch (error) {
                console.error('Session end error:', error);
                return false;
            }
        });

        // QR Code operations
        ipcMain.handle('qr-scan-save', async (event, sessionId, payload) => {
            try {
                if (!this.dbClient || !this.systemStatus.database) {
                    throw new Error('Database not connected');
                }

                const query = `
                    INSERT INTO dbo.QrScans (SessionID, RawPayload, Valid)
                    OUTPUT INSERTED.ID, INSERTED.CapturedTS
                    VALUES (?, ?, 1)
                `;
                const result = await this.dbClient.query(query, [sessionId, payload]);

                if (result.recordset.length > 0) {
                    // Update scan count in memory
                    for (const sessionData of this.activeSessions.values()) {
                        if (sessionData.sessionId === sessionId) {
                            sessionData.scanCount++;
                            break;
                        }
                    }

                    return result.recordset[0];
                }
                return null;
            } catch (error) {
                console.error('QR scan save error:', error);
                return null;
            }
        });

        // Get active sessions
        ipcMain.handle('get-active-sessions', async (event) => {
            try {
                const sessions = Array.from(this.activeSessions.values());
                return sessions;
            } catch (error) {
                console.error('Get active sessions error:', error);
                return [];
            }
        });

        // System status
        ipcMain.handle('get-system-status', async (event) => {
            return {
                ...this.systemStatus,
                rfidStatus: this.rfidListener ? this.rfidListener.getStatus() : null,
                databaseStatus: this.dbClient ? this.dbClient.getConnectionStatus() : null,
                activeSessions: this.activeSessions.size,
                uptime: process.uptime()
            };
        });

        // RFID operations
        ipcMain.handle('rfid-simulate-tag', async (event, tagId) => {
            try {
                if (!this.rfidListener) {
                    throw new Error('RFID listener not available');
                }
                return this.rfidListener.simulateTag(tagId);
            } catch (error) {
                console.error('RFID simulate error:', error);
                return false;
            }
        });

        ipcMain.handle('rfid-get-status', async (event) => {
            return this.rfidListener ? this.rfidListener.getStatus() : null;
        });

        // Application controls
        ipcMain.handle('app-minimize', () => {
            if (this.mainWindow) {
                this.mainWindow.minimize();
            }
        });

        ipcMain.handle('app-close', () => {
            app.quit();
        });

        ipcMain.handle('app-restart', () => {
            app.relaunch();
            app.exit();
        });

        // System info
        ipcMain.handle('get-system-info', () => {
            return {
                version: app.getVersion(),
                electronVersion: process.versions.electron,
                nodeVersion: process.versions.node,
                platform: process.platform,
                arch: process.arch,
                env: process.env.NODE_ENV || 'production'
            };
        });
    }

    async handleRFIDScan(tagId) {
        console.log(`🏷️ RFID Tag gescannt: ${tagId}`);

        try {
            if (!this.systemStatus.database) {
                throw new Error('Database not connected - cannot process RFID scan');
            }

            // Get user by EPC
            const user = await this.getUserByEPC(tagId);

            if (!user) {
                this.sendToRenderer('rfid-scan-error', {
                    tagId,
                    message: 'Unbekannter RFID-Tag',
                    timestamp: new Date().toISOString()
                });
                return;
            }

            const userId = user.ID;

            // Check if user is already logged in
            if (this.activeSessions.has(userId)) {
                // Logout user
                const sessionData = this.activeSessions.get(userId);
                await this.endSession(sessionData.sessionId);

                this.sendToRenderer('user-logout', {
                    user,
                    sessionId: sessionData.sessionId,
                    timestamp: new Date().toISOString()
                });

                console.log(`👋 Benutzer abgemeldet: ${user.BenutzerName}`);

            } else {
                // Login user
                const session = await this.createSession(userId);

                if (session) {
                    this.sendToRenderer('user-login', {
                        user,
                        session,
                        timestamp: new Date().toISOString()
                    });

                    console.log(`✅ Benutzer angemeldet: ${user.BenutzerName}`);
                } else {
                    this.sendToRenderer('rfid-scan-error', {
                        tagId,
                        message: 'Session konnte nicht erstellt werden',
                        timestamp: new Date().toISOString()
                    });
                }
            }

        } catch (error) {
            console.error('RFID scan handling error:', error);
            this.sendToRenderer('rfid-scan-error', {
                tagId,
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    async getUserByEPC(tagId) {
        try {
            const epcDecimal = parseInt(tagId, 16);
            const query = `
                SELECT ID, Vorname, Nachname, BenutzerName, Email, EPC
                FROM dbo.ScannBenutzer
                WHERE EPC = ? AND xStatus = 0
            `;
            const result = await this.dbClient.query(query, [epcDecimal]);
            return result.recordset.length > 0 ? result.recordset[0] : null;
        } catch (error) {
            console.error('Get user by EPC error:', error);
            return null;
        }
    }

    async createSession(userId) {
        try {
            // Close existing session
            await this.endExistingSession(userId);

            // Create new session
            const query = `
                INSERT INTO dbo.Sessions (UserID, StartTS, Active)
                OUTPUT INSERTED.ID, INSERTED.StartTS
                VALUES (?, SYSDATETIME(), 1)
            `;
            const result = await this.dbClient.query(query, [userId]);

            if (result.recordset.length > 0) {
                const session = result.recordset[0];

                // Store in memory
                this.activeSessions.set(userId, {
                    sessionId: session.ID,
                    userId: userId,
                    startTime: session.StartTS,
                    scanCount: 0
                });

                return session;
            }
            return null;
        } catch (error) {
            console.error('Create session error:', error);
            return null;
        }
    }

    async endSession(sessionId) {
        try {
            const query = `
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE ID = ? AND Active = 1
            `;
            await this.dbClient.query(query, [sessionId]);

            // Remove from memory
            for (const [userId, sessionData] of this.activeSessions.entries()) {
                if (sessionData.sessionId === sessionId) {
                    this.activeSessions.delete(userId);
                    break;
                }
            }

            return true;
        } catch (error) {
            console.error('End session error:', error);
            return false;
        }
    }

    async endExistingSession(userId) {
        try {
            const query = `
                UPDATE dbo.Sessions
                SET EndTS = SYSDATETIME(), Active = 0
                WHERE UserID = ? AND Active = 1
            `;
            await this.dbClient.query(query, [userId]);

            // Remove from memory
            this.activeSessions.delete(userId);
        } catch (error) {
            console.error('End existing session error:', error);
        }
    }

    sendToRenderer(channel, data) {
        if (this.mainWindow && this.mainWindow.webContents) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    async cleanup() {
        console.log('🧹 Cleaning up...');

        try {
            // End all active sessions
            for (const sessionData of this.activeSessions.values()) {
                await this.endSession(sessionData.sessionId);
            }

            // Stop RFID listener
            if (this.rfidListener) {
                await this.rfidListener.stop();
                this.rfidListener = null;
            }

            // Close database connection
            if (this.dbClient) {
                await this.dbClient.close();
                this.dbClient = null;
            }

            console.log('✅ Cleanup completed');
        } catch (error) {
            console.error('❌ Cleanup error:', error);
        }
    }
}

// Create and start the application
new MainApplication();