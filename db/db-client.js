/**
 * Modular Database Client
 * Composition of specialized database modules for better maintainability
 *
 * This new version maintains full backwards compatibility while providing
 * a cleaner, more maintainable architecture through module composition.
 */

// ===== CORE IMPORTS =====
const DatabaseConnection = require('./core/db-connection');
const DatabaseUtils = require('./utils/db-utils');

// ===== MODULE IMPORTS =====
const UserModule = require('./modules/db-users');
const SessionModule = require('./modules/db-sessions');
const QRScanModule = require('./modules/db-qrscans');
const StatsModule = require('./modules/db-stats');

// ===== SPECIALIZED IMPORTS =====
const HealthModule = require('./health/db-health');
const SessionTypeConstants = require('./constants/session-types');

/**
 * Enhanced Database Client with Modular Architecture
 *
 * Maintains full backwards compatibility with the original DatabaseClient
 * while providing better code organization through specialized modules.
 */
class DatabaseClient {
    constructor() {
        // ===== CORE COMPONENTS =====
        this.connection = new DatabaseConnection();
        this.utils = new DatabaseUtils();

        // ===== SPECIALIZED MODULES =====
        this.users = new UserModule(this.connection, this.utils);
        this.sessions = new SessionModule(this.connection, this.utils);
        this.qrscans = new QRScanModule(this.connection, this.utils);
        this.stats = new StatsModule(this.connection, this.utils);
        this.health = new HealthModule(this.connection, this.utils);

        // ===== BACKWARDS COMPATIBILITY PROPERTIES =====
        // Expose connection properties for compatibility
        Object.defineProperty(this, 'pool', {
            get: () => this.connection.pool
        });

        Object.defineProperty(this, 'isConnected', {
            get: () => this.connection.isConnected
        });

        Object.defineProperty(this, 'config', {
            get: () => this.connection.config
        });

        // Expose utils properties for compatibility
        Object.defineProperty(this, 'duplicateCache', {
            get: () => this.utils.duplicateCache
        });

        Object.defineProperty(this, 'pendingScans', {
            get: () => this.utils.pendingScans
        });
    }

    // ===== CORE CONNECTION METHODS (DELEGATED) =====

    async connect() {
        return await this.connection.connect();
    }

    async close() {
        // Cleanup utils first
        this.utils.cleanup();

        // Then close connection
        return await this.connection.close();
    }

    async query(queryString, parameters = []) {
        return await this.connection.query(queryString, parameters);
    }

    async transaction(callback) {
        return await this.connection.transaction(callback);
    }

    async validateTables() {
        return await this.connection.validateTables();
    }

    // ===== USER OPERATIONS (DELEGATED) =====

    async getUserByEPC(epcHex) {
        return await this.users.getUserByEPC(epcHex);
    }

    async getUserById(userId) {
        return await this.users.getUserById(userId);
    }

    async getAllActiveUsers() {
        return await this.users.getAllActiveUsers();
    }

    async searchUsers(searchTerm) {
        return await this.users.searchUsers(searchTerm);
    }

    async getUserStats(userId) {
        return await this.users.getUserStats(userId);
    }

    async validateUser(userId) {
        return await this.users.validateUser(userId);
    }

    async getUserActivity(userId, limit = 50) {
        return await this.users.getUserActivity(userId, limit);
    }

    // ===== SESSION OPERATIONS (DELEGATED) =====

    async createSession(userId, sessionType = 'Wareneingang') {
        return await this.sessions.createSession(userId, sessionType);
    }

    async getSessionWithType(sessionId) {
        return await this.sessions.getSessionWithType(sessionId);
    }

    async getActiveSessionsWithType() {
        return await this.sessions.getActiveSessionsWithType();
    }

    async endSession(sessionId) {
        return await this.sessions.endSession(sessionId);
    }

    async getActiveSession(userId) {
        return await this.sessions.getActiveSession(userId);
    }

    async getSessionDuration(sessionId) {
        return await this.sessions.getSessionDuration(sessionId);
    }

    async getSessionTypes() {
        return await this.sessions.getSessionTypes();
    }

    async getSessionTypeStats(startDate = null, endDate = null) {
        return await this.sessions.getSessionTypeStats(startDate, endDate);
    }

    // ===== QR-SCAN OPERATIONS (DELEGATED) =====

    async saveQRScan(sessionId, payload) {
        return await this.qrscans.saveQRScan(sessionId, payload);
    }

    async getQRScansBySession(sessionId, limit = 50) {
        return await this.qrscans.getQRScansBySession(sessionId, limit);
    }

    async getQRScanById(scanId) {
        return await this.qrscans.getQRScanById(scanId);
    }

    async getRecentQRScans(limit = 20) {
        return await this.qrscans.getRecentQRScans(limit);
    }

    async getQrScansWithSessionType(sessionId = null, sessionTypeName = null) {
        return await this.qrscans.getQrScansWithSessionType(sessionId, sessionTypeName);
    }

    async getQRScanStats(sessionId = null) {
        return await this.qrscans.getQRScanStats(sessionId);
    }

    async searchQRScans(searchTerm, sessionId = null, limit = 20) {
        return await this.qrscans.searchQRScans(searchTerm, sessionId, limit);
    }

    async checkQRDuplicate(payload, timeWindowHours = 0.17) {
        return await this.qrscans.checkQRDuplicate(payload, timeWindowHours);
    }

    async checkForDuplicates(rawPayload, sessionId, minutesBack = 10) {
        return await this.qrscans.checkForDuplicates(rawPayload, sessionId, minutesBack);
    }

    // Alias for backwards compatibility
    async getSessionScans(sessionId, limit = 50) {
        return await this.qrscans.getSessionScans(sessionId, limit);
    }

    // ===== STATISTICS OPERATIONS (DELEGATED) =====

    async getDailyStats(date = null) {
        return await this.stats.getDailyStats(date);
    }

    async getRecentActivity(hours = 8) {
        return await this.stats.getRecentActivity(hours);
    }

    async getUserStatsDetailed(userId = null, startDate = null, endDate = null) {
        return await this.stats.getUserStats(userId, startDate, endDate);
    }

    async getHourlyActivity(date = null) {
        return await this.stats.getHourlyActivity(date);
    }

    async getWeeklyTrends(weeks = 4) {
        return await this.stats.getWeeklyTrends(weeks);
    }

    async getPerformanceMetrics(startDate = null, endDate = null) {
        return await this.stats.getPerformanceMetrics(startDate, endDate);
    }

    async getTopPerformers(metric = 'scans', limit = 10, startDate = null, endDate = null) {
        return await this.stats.getTopPerformers(metric, limit, startDate, endDate);
    }

    async getDashboardData(timeframe = 'today') {
        return await this.stats.getDashboardData(timeframe);
    }

    // ===== HEALTH & DIAGNOSTICS (DELEGATED) =====

    async healthCheck() {
        return await this.health.healthCheck();
    }

    async testConnection() {
        return await this.health.testConnection();
    }

    getConnectionStatus() {
        return this.health.getConnectionStatus();
    }

    async debugInfo() {
        return await this.health.debugInfo();
    }

    async getPerformanceStats() {
        return await this.health.getPerformanceStats();
    }

    async getDatabaseSize() {
        return await this.health.getDatabaseSize();
    }

    async getTableSizes() {
        return await this.health.getTableSizes();
    }

    async checkSystemHealth() {
        return await this.health.checkSystemHealth();
    }

    async getSystemReport() {
        return await this.health.getSystemReport();
    }

    // ===== UTILITY METHODS (DELEGATED) =====

    normalizeTimestamp(timestamp) {
        return this.utils.normalizeTimestamp(timestamp);
    }

    formatSQLDateTime(date) {
        return this.utils.formatSQLDateTime(date);
    }

    parseSQLDateTime(sqlDateTime) {
        return this.utils.parseSQLDateTime(sqlDateTime);
    }

    formatRelativeTime(timestamp) {
        return this.utils.formatRelativeTime(timestamp);
    }

    formatSessionDuration(totalSeconds) {
        return this.utils.formatSessionDuration(totalSeconds);
    }

    parseQRCodeData(data) {
        return this.utils.parseQRCodeData(data);
    }

    parsePayloadJson(payloadJson) {
        return this.utils.parsePayloadJson(payloadJson);
    }

    extractDecodedData(payloadJson, rawPayload = null) {
        return this.utils.extractDecodedData(payloadJson, rawPayload);
    }

    getQRCodeFormat(payloadJson, rawPayload = null) {
        return this.utils.getQRCodeFormat(payloadJson, rawPayload);
    }

    clearDuplicateCache() {
        return this.utils.clearDuplicateCache();
    }

    getDuplicateCacheStats() {
        return this.utils.getDuplicateCacheStats();
    }

    // ===== ENHANCED MODULAR METHODS =====

    /**
     * Get all modules for direct access (Advanced Usage)
     * @returns {Object} - All available modules
     */
    getModules() {
        return {
            connection: this.connection,
            utils: this.utils,
            users: this.users,
            sessions: this.sessions,
            qrscans: this.qrscans,
            stats: this.stats,
            health: this.health
        };
    }

    /**
     * Setup SessionTypes (Migration Helper)
     * @returns {boolean} - Success
     */
    async setupSessionTypes() {
        return await SessionTypeConstants.setupSessionTypes(this.connection);
    }

    /**
     * Get SessionType configuration
     * @param {string} sessionTypeName - Name of the SessionType
     * @returns {Object|null} - SessionType configuration
     */
    getSessionTypeConfig(sessionTypeName) {
        return SessionTypeConstants.getSessionTypeConfig(sessionTypeName);
    }

    /**
     * Validate QR code for specific SessionType
     * @param {string} sessionTypeName - SessionType name
     * @param {Object} qrData - QR code data
     * @returns {Object} - Validation result
     */
    validateQRForSessionType(sessionTypeName, qrData) {
        return SessionTypeConstants.validateQRForSessionType(sessionTypeName, qrData);
    }

    /**
     * Enhanced QR scan with SessionType validation
     * @param {number} sessionId - Session ID
     * @param {string} payload - QR payload
     * @param {Object} options - Additional options
     * @returns {Object} - Enhanced scan result
     */
    async saveQRScanWithValidation(sessionId, payload, options = {}) {
        try {
            // Get session info if validation is requested
            if (options.validateSessionType) {
                const session = await this.getSessionWithType(sessionId);
                if (session && session.SessionTypeName) {
                    const qrData = this.parseQRCodeData(payload);
                    const validation = this.validateQRForSessionType(session.SessionTypeName, {
                        type: 'decoded_qr',
                        decoded: qrData
                    });

                    if (!validation.isValid) {
                        return {
                            success: false,
                            status: 'validation_failed',
                            message: validation.message,
                            data: null,
                            timestamp: new Date().toISOString()
                        };
                    }
                }
            }

            // Proceed with normal scan saving
            return await this.saveQRScan(sessionId, payload);
        } catch (error) {
            return {
                success: false,
                status: 'error',
                message: `Fehler bei validiertem QR-Scan: ${error.message}`,
                data: null,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Get comprehensive session report
     * @param {number} sessionId - Session ID
     * @returns {Object} - Comprehensive session report
     */
    async getSessionReport(sessionId) {
        try {
            const [
                session,
                scans,
                duration,
                stats
            ] = await Promise.all([
                this.getSessionWithType(sessionId),
                this.getQRScansBySession(sessionId),
                this.getSessionDuration(sessionId),
                this.getQRScanStats(sessionId)
            ]);

            return {
                session,
                scans,
                duration,
                stats,
                summary: {
                    sessionId: sessionId,
                    totalScans: scans.length,
                    validScans: scans.filter(s => s.Valid).length,
                    duration: duration,
                    sessionType: session?.SessionTypeName,
                    user: session ? {
                        id: session.UserID,
                        name: session.UserName || 'Unknown'
                    } : null
                },
                generatedAt: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Fehler beim Erstellen des Session-Reports: ${error.message}`);
        }
    }
}

// ===== BACKWARDS COMPATIBILITY EXPORTS =====

// Standard-Export bleibt DatabaseClient (für bestehenden Code)
module.exports = DatabaseClient;

// Named Exports für erweiterte Nutzung
module.exports.DatabaseClient = DatabaseClient;
module.exports.SESSION_TYPES = SessionTypeConstants.SESSION_TYPES;
module.exports.createWareneingangSession = SessionTypeConstants.createWareneingangSession;
module.exports.getWareneingangSessionTypeId = SessionTypeConstants.getWareneingangSessionTypeId;

// Module exports für direkte Nutzung (Advanced)
module.exports.modules = {
    DatabaseConnection,
    DatabaseUtils,
    UserModule,
    SessionModule,
    QRScanModule,
    StatsModule,
    HealthModule,
    SessionTypeConstants
};