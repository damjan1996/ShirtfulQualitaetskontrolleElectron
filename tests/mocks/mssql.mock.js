// tests/mocks/mssql.mock.js
/**
 * MSSQL Module Mock für Tests
 */

const EventEmitter = require('events');

class MockConnectionPool extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = config;
        this.connected = false;
        this.connecting = false;
        this.requests = [];
        this.transactions = [];
    }

    async connect() {
        if (this.connected) {
            return this;
        }

        this.connecting = true;

        // Simuliere Verbindungszeit
        await new Promise(resolve => setTimeout(resolve, 100));

        this.connected = true;
        this.connecting = false;

        this.emit('connect');
        return this;
    }

    async close() {
        if (!this.connected) {
            return this;
        }

        this.connected = false;
        this.requests = [];
        this.transactions = [];

        this.emit('close');
        return this;
    }

    request() {
        if (!this.connected) {
            throw new Error('Connection pool is not connected');
        }

        const request = new MockRequest(this);
        this.requests.push(request);
        return request;
    }

    transaction() {
        if (!this.connected) {
            throw new Error('Connection pool is not connected');
        }

        const transaction = new MockTransaction(this);
        this.transactions.push(transaction);
        return transaction;
    }

    // Test helpers
    isConnected() {
        return this.connected;
    }

    getActiveRequests() {
        return this.requests.filter(r => r.active);
    }

    getActiveTransactions() {
        return this.transactions.filter(t => t.active);
    }
}

class MockRequest extends EventEmitter {
    constructor(pool) {
        super();
        this.pool = pool;
        this.parameters = new Map();
        this.active = false;
        this.cancelled = false;
    }

    input(name, type, value) {
        this.parameters.set(name, { type, value });
        return this;
    }

    output(name, type, value) {
        this.parameters.set(name, { type, value, output: true });
        return this;
    }

    async query(command) {
        if (this.cancelled) {
            throw new Error('Request was cancelled');
        }

        this.active = true;

        try {
            // Simuliere Query-Ausführung
            await new Promise(resolve => setTimeout(resolve, Math.random() * 100 + 10));

            const result = this._mockQueryResult(command);

            this.active = false;
            return result;

        } catch (error) {
            this.active = false;
            throw error;
        }
    }

    async execute(procedure) {
        if (this.cancelled) {
            throw new Error('Request was cancelled');
        }

        this.active = true;

        try {
            // Simuliere Stored Procedure Ausführung
            await new Promise(resolve => setTimeout(resolve, Math.random() * 150 + 20));

            const result = this._mockProcedureResult(procedure);

            this.active = false;
            return result;

        } catch (error) {
            this.active = false;
            throw error;
        }
    }

    async batch(batch) {
        if (this.cancelled) {
            throw new Error('Request was cancelled');
        }

        this.active = true;

        try {
            // Simuliere Batch-Ausführung
            await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 30));

            const result = this._mockBatchResult(batch);

            this.active = false;
            return result;

        } catch (error) {
            this.active = false;
            throw error;
        }
    }

    cancel() {
        this.cancelled = true;
        this.active = false;
        this.emit('cancel');
    }

    _mockQueryResult(command) {
        const commandLower = command.toLowerCase();

        // Mock verschiedene Query-Typen
        if (commandLower.includes('select') && commandLower.includes('scannbenutzer')) {
            return this._mockUserSelectResult(command);
        }

        if (commandLower.includes('select') && commandLower.includes('sessions')) {
            return this._mockSessionSelectResult(command);
        }

        if (commandLower.includes('select') && commandLower.includes('qrscans')) {
            return this._mockQRScanSelectResult(command);
        }

        if (commandLower.includes('insert')) {
            return this._mockInsertResult(command);
        }

        if (commandLower.includes('update')) {
            return this._mockUpdateResult(command);
        }

        if (commandLower.includes('delete')) {
            return this._mockDeleteResult(command);
        }

        // Default Mock-Result
        return {
            recordset: [],
            recordsets: [[]],
            rowsAffected: [0],
            output: {}
        };
    }

    _mockUserSelectResult(command) {
        // Mock User-Abfragen
        const epcParam = this.parameters.get('epc');
        const idParam = this.parameters.get('id');

        let users = [
            {
                ID: 1,
                BenutzerName: 'Test User 1',
                EPC: 1392525588,
                Email: 'test1@example.com',
                Rolle: 'Mitarbeiter',
                xStatus: 0,
                ErstelltAm: new Date('2024-01-01'),
                AktiviertAm: new Date('2024-01-01')
            },
            {
                ID: 2,
                BenutzerName: 'Test User 2',
                EPC: 2271560481,
                Email: 'test2@example.com',
                Rolle: 'Mitarbeiter',
                xStatus: 0,
                ErstelltAm: new Date('2024-01-02'),
                AktiviertAm: new Date('2024-01-02')
            }
        ];

        if (epcParam) {
            users = users.filter(u => u.EPC === epcParam.value);
        }

        if (idParam) {
            users = users.filter(u => u.ID === idParam.value);
        }

        return {
            recordset: users,
            recordsets: [users],
            rowsAffected: [users.length],
            output: {}
        };
    }

    _mockSessionSelectResult(command) {
        // Mock Session-Abfragen
        const userIdParam = this.parameters.get('userId');
        const sessionIdParam = this.parameters.get('sessionId');

        let sessions = [
            {
                ID: 1,
                UserID: 1,
                StartTS: new Date(),
                EndTS: null,
                Active: 1,
                ErstelltAm: new Date()
            }
        ];

        if (userIdParam) {
            sessions = sessions.filter(s => s.UserID === userIdParam.value);
        }

        if (sessionIdParam) {
            sessions = sessions.filter(s => s.ID === sessionIdParam.value);
        }

        return {
            recordset: sessions,
            recordsets: [sessions],
            rowsAffected: [sessions.length],
            output: {}
        };
    }

    _mockQRScanSelectResult(command) {
        // Mock QR-Scan-Abfragen
        const sessionIdParam = this.parameters.get('sessionId');
        const limitParam = this.parameters.get('limit');

        let scans = [
            {
                ID: 1,
                SessionID: 1,
                RawPayload: 'MOCK_QR_001',
                PayloadAsJSON: null,
                ScannTS: new Date(),
                ScannTypID: 1,
                ErstelltAm: new Date()
            },
            {
                ID: 2,
                SessionID: 1,
                RawPayload: 'MOCK_QR_002',
                PayloadAsJSON: null,
                ScannTS: new Date(),
                ScannTypID: 1,
                ErstelltAm: new Date()
            }
        ];

        if (sessionIdParam) {
            scans = scans.filter(s => s.SessionID === sessionIdParam.value);
        }

        if (limitParam && limitParam.value > 0) {
            scans = scans.slice(0, limitParam.value);
        }

        return {
            recordset: scans,
            recordsets: [scans],
            rowsAffected: [scans.length],
            output: {}
        };
    }

    _mockInsertResult(command) {
        // Mock INSERT-Operationen
        return {
            recordset: [],
            recordsets: [[]],
            rowsAffected: [1],
            output: {
                inserted_id: Math.floor(Math.random() * 1000) + 1
            }
        };
    }

    _mockUpdateResult(command) {
        // Mock UPDATE-Operationen
        return {
            recordset: [],
            recordsets: [[]],
            rowsAffected: [1],
            output: {}
        };
    }

    _mockDeleteResult(command) {
        // Mock DELETE-Operationen
        return {
            recordset: [],
            recordsets: [[]],
            rowsAffected: [1],
            output: {}
        };
    }

    _mockProcedureResult(procedure) {
        // Mock Stored Procedure Results
        return {
            recordset: [],
            recordsets: [[]],
            rowsAffected: [0],
            output: {},
            returnValue: 0
        };
    }

    _mockBatchResult(batch) {
        // Mock Batch Results
        return {
            recordset: [],
            recordsets: [[]],
            rowsAffected: [0],
            output: {}
        };
    }
}

class MockTransaction extends EventEmitter {
    constructor(pool) {
        super();
        this.pool = pool;
        this.active = false;
        this.committed = false;
        this.rolledBack = false;
        this.isolationLevel = null;
    }

    async begin(isolationLevel) {
        if (this.active) {
            throw new Error('Transaction is already active');
        }

        this.active = true;
        this.isolationLevel = isolationLevel;

        // Simuliere Transaction-Start
        await new Promise(resolve => setTimeout(resolve, 10));

        this.emit('begin');
        return this;
    }

    async commit() {
        if (!this.active) {
            throw new Error('Transaction is not active');
        }

        if (this.rolledBack) {
            throw new Error('Transaction was already rolled back');
        }

        // Simuliere Commit
        await new Promise(resolve => setTimeout(resolve, 20));

        this.active = false;
        this.committed = true;

        this.emit('commit');
        return this;
    }

    async rollback() {
        if (!this.active) {
            throw new Error('Transaction is not active');
        }

        if (this.committed) {
            throw new Error('Transaction was already committed');
        }

        // Simuliere Rollback
        await new Promise(resolve => setTimeout(resolve, 15));

        this.active = false;
        this.rolledBack = true;

        this.emit('rollback');
        return this;
    }

    request() {
        if (!this.active) {
            throw new Error('Transaction is not active');
        }

        const request = new MockRequest(this.pool);
        request.transaction = this;
        return request;
    }
}

// Mock SQL Data Types
const mockTypes = {
    VarChar: (length) => ({ type: 'VarChar', length }),
    NVarChar: (length) => ({ type: 'NVarChar', length }),
    Int: { type: 'Int' },
    BigInt: { type: 'BigInt' },
    Bit: { type: 'Bit' },
    DateTime: { type: 'DateTime' },
    DateTime2: { type: 'DateTime2' },
    UniqueIdentifier: { type: 'UniqueIdentifier' },
    Text: { type: 'Text' },
    NText: { type: 'NText' },
    Decimal: (precision, scale) => ({ type: 'Decimal', precision, scale }),
    Float: { type: 'Float' },
    Real: { type: 'Real' },
    Money: { type: 'Money' },
    SmallMoney: { type: 'SmallMoney' }
};

// Mock Isolation Levels
const mockIsolationLevel = {
    READ_UNCOMMITTED: 1,
    READ_COMMITTED: 2,
    REPEATABLE_READ: 3,
    SERIALIZABLE: 4,
    SNAPSHOT: 5
};

// Mock Connection Konfigurations-Optionen
const mockConnectionOptions = {
    encrypt: true,
    trustServerCertificate: false,
    connectionTimeout: 15000,
    requestTimeout: 15000,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Main Mock Export
const mockMSSql = {
    ConnectionPool: MockConnectionPool,
    Request: MockRequest,
    Transaction: MockTransaction,

    // Data Types
    TYPES: mockTypes,

    // Isolation Levels
    ISOLATION_LEVEL: mockIsolationLevel,

    // Convenience functions
    connect: async (config) => {
        const pool = new MockConnectionPool(config);
        await pool.connect();
        return pool;
    },

    query: async (command, config) => {
        const pool = new MockConnectionPool(config);
        await pool.connect();
        const request = pool.request();
        const result = await request.query(command);
        await pool.close();
        return result;
    },

    // Test helpers
    createMockPool: (config = {}) => new MockConnectionPool(config),
    createMockRequest: (pool) => new MockRequest(pool),
    createMockTransaction: (pool) => new MockTransaction(pool),

    // Reset all mocks
    resetMocks: () => {
        // Kann verwendet werden um alle Mock-Zustände zurückzusetzen
    }
};

module.exports = mockMSSql;