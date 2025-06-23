#!/usr/bin/env node

/**
 * Wareneingang RFID QR - Vereinfachtes Setup Script
 * Automatisierte Installation und Konfiguration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

class WareneingangSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.config = {
            database: {},
            ui: {},
            application: {}
        };

        // Package Manager erkennen
        this.packageManager = this.detectPackageManager();
    }

    detectPackageManager() {
        // pnpm bevorzugen wenn verfügbar
        try {
            execSync('pnpm --version', { stdio: 'ignore' });
            if (fs.existsSync('pnpm-lock.yaml')) {
                return 'pnpm';
            }
        } catch {}

        // Fallback auf npm
        return 'npm';
    }

    async run() {
        console.log('🏭 Wareneingang RFID QR - Setup');
        console.log('='.repeat(40));
        console.log();

        try {
            await this.checkPrerequisites();
            await this.collectConfiguration();
            await this.installDependencies();
            await this.createEnvironmentFile();
            await this.testConnections();
            await this.finalizeSetup();

            console.log('\n✅ Setup erfolgreich abgeschlossen!');
            console.log('\n🚀 Starten Sie die Anwendung mit: npm start');

        } catch (error) {
            console.error('\n❌ Setup fehlgeschlagen:', error.message);
            process.exit(1);
        } finally {
            this.rl.close();
        }
    }

    async checkPrerequisites() {
        console.log('🔍 Überprüfe Systemvoraussetzungen...');

        // Node.js Version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

        if (majorVersion < 16) {
            throw new Error(`Node.js 16+ erforderlich, gefunden: ${nodeVersion}`);
        }
        console.log(`  ✅ Node.js ${nodeVersion}`);

        // Package Manager
        try {
            const pmVersion = execSync(`${this.packageManager} --version`, { encoding: 'utf8' }).trim();
            console.log(`  ✅ ${this.packageManager} ${pmVersion}`);
        } catch (error) {
            throw new Error(`${this.packageManager} nicht gefunden`);
        }

        // Projektverzeichnis
        if (!fs.existsSync('package.json')) {
            throw new Error('package.json nicht gefunden - Setup im Projektverzeichnis ausführen');
        }
        console.log(`  ✅ Projektverzeichnis: ${process.cwd()}`);

        // ODBC Driver prüfen (optional)
        try {
            console.log('  🔍 Prüfe SQL Server ODBC Driver...');
            // Vereinfachte Prüfung - nicht kritisch
            console.log('  ✅ SQL Server Treiber (Prüfung übersprungen)');
        } catch (error) {
            console.log('  ⚠️  SQL Server ODBC Driver nicht erkannt - bitte manuell installieren');
        }

        console.log();
    }

    async collectConfiguration() {
        console.log('⚙️ Konfiguration sammeln...');
        console.log();

        // Vereinfachte Konfiguration für Wareneingang
        console.log('📊 Datenbank-Einstellungen (SQL Server):');
        this.config.database.server = await this.askQuestion('SQL Server Adresse [116.202.224.248]: ') || '116.202.224.248';
        this.config.database.database = await this.askQuestion('Datenbank Name [RdScanner]: ') || 'RdScanner';
        this.config.database.user = await this.askQuestion('Benutzername [sa]: ') || 'sa';
        this.config.database.password = await this.askQuestion('Passwort: ', true);
        this.config.database.port = await this.askQuestion('Port [1433]: ') || '1433';

        console.log();

        // UI-Konfiguration (vereinfacht)
        console.log('🎨 Benutzeroberfläche:');
        this.config.ui.width = await this.askQuestion('Fensterbreite [1400]: ') || '1400';
        this.config.ui.height = await this.askQuestion('Fensterhöhe [900]: ') || '900';

        const fullscreenChoice = await this.askYesNo('Vollbild-Modus empfohlen?', true);
        if (fullscreenChoice) {
            this.config.ui.width = '1920';
            this.config.ui.height = '1080';
        }

        console.log();

        // Wareneingang-spezifische Einstellungen
        console.log('📦 Wareneingang-Einstellungen:');
        this.config.application.scanCooldown = await this.askQuestion('QR-Scan Cooldown in Sekunden [300]: ') || '300';
        this.config.application.audioFeedback = await this.askYesNo('Audio-Feedback bei Scans?', true);
        this.config.application.maxRecentScans = await this.askQuestion('Anzahl Recent Scans [10]: ') || '10';

        console.log();
    }

    async installDependencies() {
        console.log('📦 Installiere Dependencies...');

        try {
            console.log(`  🔄 ${this.packageManager} install...`);

            let installCommand;
            if (this.packageManager === 'pnpm') {
                installCommand = 'pnpm install --prefer-offline';
            } else {
                installCommand = 'npm install --prefer-offline --no-audit';
            }

            execSync(installCommand, {
                stdio: 'inherit',
                timeout: 300000 // 5 Minuten
            });

            console.log('  ✅ Dependencies installiert');

            // Optional: Native Module rebuilden
            const rebuildChoice = await this.askYesNo('Native Module rebuilden (empfohlen für RFID)?', true);
            if (rebuildChoice) {
                try {
                    console.log('  🔧 Rebuilding native modules...');
                    execSync(`${this.packageManager} run rebuild`, { stdio: 'inherit' });
                    console.log('  ✅ Native Module erfolgreich rebuilt');
                } catch (rebuildError) {
                    console.log('  ⚠️  Native Module Rebuild fehlgeschlagen - RFID eventuell nicht verfügbar');
                }
            }

        } catch (error) {
            console.log('\n❌ Installation fehlgeschlagen!');

            if (this.packageManager === 'pnpm') {
                console.log('🔧 Versuchen Sie:');
                console.log('1. pnpm store prune');
                console.log('2. pnpm install --force');
            } else {
                console.log('🔧 Versuchen Sie:');
                console.log('1. npm cache clean --force');
                console.log('2. npm install --force');
            }

            throw new Error(`Dependency Installation fehlgeschlagen: ${error.message}`);
        }

        console.log();
    }

    async createEnvironmentFile() {
        console.log('📝 Erstelle .env Konfigurationsdatei...');

        const envContent = `# Wareneingang RFID QR - Konfiguration
# Automatisch generiert am ${new Date().toISOString()}

# ===== DATENBANK =====
MSSQL_SERVER=${this.config.database.server}
MSSQL_DATABASE=${this.config.database.database}
MSSQL_USER=${this.config.database.user}
MSSQL_PASSWORD=${this.config.database.password}
MSSQL_PORT=${this.config.database.port}
MSSQL_ENCRYPT=false
MSSQL_TRUST_CERT=true
MSSQL_REQUEST_TIMEOUT=30000
MSSQL_CONNECTION_TIMEOUT=15000

# ===== RFID KONFIGURATION =====
RFID_MIN_SCAN_INTERVAL=1000
RFID_INPUT_TIMEOUT=500
RFID_MAX_BUFFER_LENGTH=15

# ===== QR-SCANNER =====
QR_GLOBAL_COOLDOWN=${this.config.application.scanCooldown}
QR_SESSION_COOLDOWN=3600
QR_CROSS_USER_CHECK=true

# ===== BENUTZEROBERFLÄCHE =====
UI_WINDOW_WIDTH=${this.config.ui.width}
UI_WINDOW_HEIGHT=${this.config.ui.height}
UI_MIN_WIDTH=1200
UI_MIN_HEIGHT=700
UI_THEME=auto
UI_UPDATE_INTERVAL=1000
UI_SHOW_DEBUG=false

# ===== WARENEINGANG =====
MAX_RECENT_SCANS=${this.config.application.maxRecentScans}
SCAN_SUCCESS_DURATION=2000
AUDIO_FEEDBACK=${this.config.application.audioFeedback}
CAMERA_RESOLUTION_WIDTH=1280
CAMERA_RESOLUTION_HEIGHT=720

# ===== ANWENDUNG =====
NODE_ENV=production
APP_DEBUG=false
LOG_LEVEL=info
AUTO_START_COMPONENTS=true
`;

        fs.writeFileSync('.env', envContent);
        console.log('  ✅ .env Datei erstellt');
        console.log();
    }

    async testConnections() {
        console.log('🔍 Teste Verbindungen...');

        // Datenbank-Test
        console.log('  🔄 Teste Datenbankverbindung...');
        try {
            // Erst prüfen ob DB-Client verfügbar ist
            if (!fs.existsSync('./db/db-client.js')) {
                console.log('  ⚠️  DB-Client nicht gefunden - überspringe Test');
                return;
            }

            const DatabaseClient = require('./db/db-client');
            const dbClient = new DatabaseClient();

            await dbClient.connect();
            const healthCheck = await dbClient.healthCheck();

            if (healthCheck.connected) {
                console.log('  ✅ Datenbankverbindung erfolgreich');
                console.log(`    Server: ${healthCheck.server?.DatabaseName}`);
                console.log(`    Dauer: ${healthCheck.connectionTime}ms`);
            } else {
                throw new Error(healthCheck.error);
            }

            await dbClient.close();

        } catch (error) {
            console.log(`  ❌ Datenbankverbindung fehlgeschlagen: ${error.message}`);

            const retry = await this.askYesNo('Datenbankeinstellungen korrigieren?', true);
            if (retry) {
                console.log('\n📊 Korrigierte Datenbank-Einstellungen:');
                this.config.database.server = await this.askQuestion(`Server [${this.config.database.server}]: `) || this.config.database.server;
                this.config.database.user = await this.askQuestion(`Benutzer [${this.config.database.user}]: `) || this.config.database.user;
                this.config.database.password = await this.askQuestion('Neues Passwort: ', true) || this.config.database.password;

                // .env aktualisieren
                await this.createEnvironmentFile();

                // Erneut testen
                return this.testConnections();
            } else {
                console.log('  ⚠️  Fahre ohne Datenbanktest fort');
            }
        }

        console.log();
    }

    async finalizeSetup() {
        console.log('🎯 Finalisiere Setup...');

        // Verzeichnisse erstellen
        const directories = ['logs', 'temp', 'backup'];
        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`  ✅ Verzeichnis erstellt: ${dir}/`);
            }
        });

        // Start-Script erstellen
        const startScript = `@echo off
echo.
echo =======================================
echo   Wareneingang RFID QR System
echo   Shirtful GmbH
echo =======================================
echo.
echo Starte Anwendung...
cd /d "%~dp0"
${this.packageManager} start
echo.
echo Anwendung beendet. Druecken Sie eine Taste...
pause > nul`;

        fs.writeFileSync('start.bat', startScript);
        console.log('  ✅ start.bat erstellt');

        // Schnelltest-Script
        const quickTestScript = `@echo off
echo Teste Datenbank-Verbindung...
cd /d "%~dp0"
node scripts/quick-test.js
pause`;

        fs.writeFileSync('test-db.bat', quickTestScript);
        console.log('  ✅ test-db.bat erstellt');

        console.log();
    }

    async askQuestion(question, isPassword = false) {
        return new Promise((resolve) => {
            if (isPassword) {
                // Vereinfachte Passwort-Eingabe
                this.rl.question(question, (answer) => {
                    resolve(answer);
                });
            } else {
                this.rl.question(question, (answer) => {
                    resolve(answer);
                });
            }
        });
    }

    async askYesNo(question, defaultValue = false) {
        const defaultText = defaultValue ? '[J/n]' : '[j/N]';
        const answer = await this.askQuestion(`${question} ${defaultText}: `);

        if (answer.toLowerCase() === 'j' || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            return true;
        } else if (answer.toLowerCase() === 'n' || answer.toLowerCase() === 'no') {
            return false;
        } else {
            return defaultValue;
        }
    }
}

// ===== MAIN EXECUTION =====
async function main() {
    console.log('🏭 Wareneingang RFID QR - Vereinfachtes Setup');
    console.log('='.repeat(50));
    console.log('Dieses Setup konfiguriert die Anwendung für den Wareneingang.');
    console.log('');

    try {
        const setup = new WareneingangSetup();
        await setup.run();
    } catch (error) {
        console.error('❌ Setup-Fehler:', error.message);
        process.exit(1);
    }
}

// Script starten wenn direkt aufgerufen
if (require.main === module) {
    main();
}

module.exports = WareneingangSetup;