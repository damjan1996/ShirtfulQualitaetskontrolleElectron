// tests/mocks/mssql.mock.js
/**
 * MSSQL Mock für Jest Tests
 * Simuliert Microsoft SQL Server Verbindungen und Queries
 */

// Mock-Datenbank mit Test-Daten
const mockDatabase = {
    ScannBenutzer: [
        {
            ID: 1,
            Vorname: 'Max',
            Nachname: 'Mustermann',
            BenutzerName: 'Max Mustermann',
            Email: 'max@example.com',
            EPC: 1392525588, // 53004114 in hex
            xStatus: 0
        },
        {
            ID: 2,
            Vorname: 'Anna',
            Nachname: 'Schmidt',
            BenutzerName: 'Anna Schmidt',
            Email: 'anna@example.com',
            EPC: 1234567890,
            xStatus: 0
        }
    ],
    Sessions: [
        {
            ID: 1,
            UserID: 1,
            StartTS: new Date('2024-01-01T08:00:00.000Z'),
            EndTS: new Date('2024-01-01T17:00:00.000Z'),
            Active: 0
        },
        {
            ID: 2,
            UserID: 1,
            StartTS: new Date(),
            EndTS: null,
            Active: 1
        }
    ],
    QrScans: [
        {
            ID: 1,
            SessionID: 1,
            RawPayload: 'TEST_QR_CODE_123',
            CapturedTS: new Date(),
            Valid: 1
        }
    ]
};

// Mock Query-Ausführung
const executeQuery = (query, inputs = {}) => {
    const sql = query.toLowerCase();

    // Simuliere verschiedene SQL-Queries
    if (sql.includes('select') && sql.includes('scannbenutzer')) {
        if (sql.includes('where') && sql.includes('epc')) {
            // Benutzer nach EPC suchen
            const epc = inputs.epc || Object.values(inputs)[0];
            const user = mockDatabase.ScannBenutzer.find(u => u.EPC === epc);
            return { recordset: user ? [user] : [] };
        }
        // Alle Benutzer
        return { recordset: mockDatabase.ScannBenutzer };
    }

    if (sql.includes('select') && sql.includes('sessions')) {
        if (sql.includes('where') && sql.includes('active')) {
            // Aktive Sessions
            const activeSessions = mockDatabase.Sessions.filter(s => s.Active === 1);
            return { recordset: activeSessions };
        }
        if (sql.includes('where') && sql.includes('userid')) {
            // Sessions für bestimmten Benutzer
            const userID = inputs.userID || Object.values(inputs)[0];
            const userSessions = mockDatabase.Sessions.filter(s => s.UserID === userID);
            return { recordset: userSessions };
        }
        // Alle Sessions
        return { recordset: mockDatabase.Sessions };
    }

    if (sql.includes('insert') && sql.includes('sessions')) {
        // Neue Session erstellen
        const newSession = {
            ID: mockDatabase.Sessions.length + 1,
            UserID: inputs.userID || 1,
            StartTS: new Date(),
            EndTS: null,
            Active: 1
        };
        mockDatabase.Sessions.push(newSession);
        return { recordset: [newSession], rowsAffected: [1] };
    }

    if (sql.includes('update') && sql.includes('sessions')) {
        // Session aktualisieren
        const sessionID = inputs.sessionID || inputs.id;
        const session = mockDatabase.Sessions.find(s => s.ID === sessionID);
        if (session) {
            session.EndTS = new Date();
            session.Active = 0;
            return { recordset: [session], rowsAffected: [1] };
        }
        return { recordset: [], rowsAffected: [0] };
    }

    if (sql.includes('insert') && sql.includes('qrscans')) {
        // Neuen QR-Scan erstellen
        const newScan = {
            ID: mockDatabase.QrScans.length + 1,
            SessionID: inputs.sessionID || 1,
            RawPayload: inputs.rawPayload || 'TEST_QR',
            CapturedTS: new Date(),
            Valid: 1
        };
        mockDatabase.QrScans.push(newScan);
        return { recordset: [newScan], rowsAffected: [1] };
    }

    if (sql.includes('select') && sql.includes('qrscans')) {
        // QR-Scans abfragen
        if (sql.includes('where') && sql.includes('sessionid')) {
            const sessionID = inputs.sessionID || Object.values(inputs)[0];
            const scans = mockDatabase.QrScans.filter(q => q.SessionID === sessionID);
            return { recordset: scans };
        }
        return { recordset: mockDatabase.QrScans };
    }

    // Default: leeres Ergebnis
    return { recordset: [], rowsAffected: [0] };
};

// Mock Request-Klasse
const mockRequest = jest.fn().mockImplementation(() => {
    const inputs = {};

    return {
        input: jest.fn().mockImplementation((name, type, value) => {
            inputs[name] = value;
            return mockRequest();
        }),
        query: jest.fn().mockImplementation((sql) => {
            return Promise.resolve(executeQuery(sql, inputs));
        }),
        inputs
    };
});

// Mock Connection Pool
const mockConnectionPool = jest.fn().mockImplementation((config) => {
    let isConnected = false;

    return {
        connect: jest.fn().mockImplementation(() => {
            isConnected = true;
            return Promise.resolve();
        }),
        close: jest.fn().mockImplementation(() => {
            isConnected = false;
            return Promise.resolve();
        }),
        query: jest.fn().mockImplementation((sql) => {
            if (!isConnected) {
                return Promise.reject(new Error('Connection not established'));
            }
            return Promise.resolve(executeQuery(sql));
        }),
        request: jest.fn().mockImplementation(() => {
            if (!isConnected) {
                throw new Error('Connection not established');
            }
            return mockRequest();
        }),
        connected: isConnected,
        connecting: false,
        healthy: true,
        config
    };
});

// SQL Server Datentypen
const mockTypes = {
    Int: jest.fn().mockImplementation(() => ({ type: 'int' })),
    VarChar: jest.fn().mockImplementation((length) => ({ type: 'varchar', length })),
    NVarChar: jest.fn().mockImplementation((length) => ({ type: 'nvarchar', length })),
    DateTime: jest.fn().mockImplementation(() => ({ type: 'datetime' })),
    DateTime2: jest.fn().mockImplementation(() => ({ type: 'datetime2' })),
    Bit: jest.fn().mockImplementation(() => ({ type: 'bit' })),
    BigInt: jest.fn().mockImplementation(() => ({ type: 'bigint' })),
    Float: jest.fn().mockImplementation(() => ({ type: 'float' })),
    Decimal: jest.fn().mockImplementation((precision, scale) => ({
        type: 'decimal',
        precision,
        scale
    })),
    UniqueIdentifier: jest.fn().mockImplementation(() => ({ type: 'uniqueidentifier' })),
    Text: jest.fn().mockImplementation(() => ({ type: 'text' })),
    NText: jest.fn().mockImplementation(() => ({ type: 'ntext' }))
};

// Isolation Levels
const ISOLATION_LEVEL = {
    READ_UNCOMMITTED: 1,
    READ_COMMITTED: 2,
    REPEATABLE_READ: 3,
    SERIALIZABLE: 4,
    SNAPSHOT: 5
};

// Mock Error-Klassen
class ConnectionError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'ConnectionError';
        this.code = code;
    }
}

class TransactionError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'TransactionError';
        this.code = code;
    }
}

class RequestError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'RequestError';
        this.code = code;
    }
}

class PreparedStatementError extends Error {
    constructor(message, code) {
        super(message);
        this.name = 'PreparedStatementError';
        this.code = code;
    }
}

// Helper-Funktionen für Tests
const mockHelpers = {
    // Mock-Datenbank zurücksetzen
    resetDatabase: () => {
        mockDatabase.ScannBenutzer.length = 0;
        mockDatabase.Sessions.length = 0;
        mockDatabase.QrScans.length = 0;

        // Standard-Testdaten hinzufügen
        mockDatabase.ScannBenutzer.push(
            {
                ID: 1,
                Vorname: 'Max',
                Nachname: 'Mustermann',
                BenutzerName: 'Max Mustermann',
                Email: 'max@example.com',
                EPC: 1392525588,
                xStatus: 0
            }
        );
    },

    // Test-Benutzer hinzufügen
    addUser: (user) => {
        const newUser = {
            ID: mockDatabase.ScannBenutzer.length + 1,
            ...user
        };
        mockDatabase.ScannBenutzer.push(newUser);
        return newUser;
    },

    // Test-Session hinzufügen
    addSession: (session) => {
        const newSession = {
            ID: mockDatabase.Sessions.length + 1,
            ...session
        };
        mockDatabase.Sessions.push(newSession);
        return newSession;
    },

    // Aktuelle Mock-Daten abrufen
    getDatabase: () => ({ ...mockDatabase })
};

// Haupt-Mock-Export
module.exports = {
    // Hauptklassen
    ConnectionPool: mockConnectionPool,
    Request: mockRequest,

    // Datentypen
    sql: mockTypes,

    // Konstanten
    ISOLATION_LEVEL,

    // Error-Klassen
    ConnectionError,
    TransactionError,
    RequestError,
    PreparedStatementError,

    // Verbindungsmethoden (deprecated, aber für Kompatibilität)
    connect: jest.fn().mockImplementation((config) => {
        return Promise.resolve();
    }),
    close: jest.fn().mockImplementation(() => {
        return Promise.resolve();
    }),
    query: jest.fn().mockImplementation((sql) => {
        return Promise.resolve(executeQuery(sql));
    }),

    // Test-Helpers
    __mockHelpers: mockHelpers,
    __mockDatabase: mockDatabase
};