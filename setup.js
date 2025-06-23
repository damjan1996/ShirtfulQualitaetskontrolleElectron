#!/usr/bin/env node

/**
 * RFID QR Wareneingang - Electron Setup Script (Fixed)
 * Automatisierte Installation und Konfiguration mit pnpm Support
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

class ElectronSetup {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.config = {
            database: {},
            rfid: {},
            ui: {},
            application: {}
        };

        // Detect package manager
        this.packageManager = this.detectPackageManager();
    }

    detectPackageManager() {
        // Check if pnpm is available and preferred
        try {
            execSync('pnpm --version', { stdio: 'ignore' });
            if (fs.existsSync('pnpm-lock.yaml')) {
                return 'pnpm';
            }
        } catch {}

        // Check for yarn
        try {
            execSync('yarn --version', { stdio: 'ignore' });
            if (fs.existsSync('yarn.lock')) {
                return 'yarn';
            }
        } catch {}

        // Default to npm
        return 'npm';
    }

    async run() {
        console.log('🚀 RFID QR Wareneingang - Electron Setup (Fixed)');
        console.log('==========================================');
        console.log();

        try {
            await this.checkPrerequisites();
            await this.cleanupPrevious();
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
        console.log('🔍 Überprüfe Voraussetzungen...');

        // Node.js Version prüfen
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.split('.')[0].substring(1));

        if (majorVersion < 16) {
            throw new Error(`Node.js 16+ erforderlich, gefunden: ${nodeVersion}`);
        }
        console.log(`  ✅ Node.js ${nodeVersion}`);

        // Package Manager prüfen
        try {
            const pmVersion = execSync(`${this.packageManager} --version`, { encoding: 'utf8' }).trim();
            console.log(`  ✅ ${this.packageManager} ${pmVersion}`);
        } catch (error) {
            throw new Error(`${this.packageManager} nicht gefunden`);
        }

        // Betriebssystem prüfen
        const platform = process.platform;
        console.log(`  ✅ Betriebssystem: ${platform}`);

        // Projektverzeichnis prüfen
        if (!fs.existsSync('package.json')) {
            throw new Error('package.json nicht gefunden - führen Sie Setup im Projektverzeichnis aus');
        }
        console.log(`  ✅ Projektverzeichnis: ${process.cwd()}`);

        console.log();
    }

    async cleanupPrevious() {
        console.log('🧹 Bereinige vorherige Installation...');

        // node_modules löschen falls vorhanden
        if (fs.existsSync('node_modules')) {
            console.log('  🗑️ Lösche node_modules...');
            try {
                if (process.platform === 'win32') {
                    execSync('rmdir /s /q node_modules', { stdio: 'ignore' });
                } else {
                    execSync('rm -rf node_modules', { stdio: 'ignore' });
                }
            } catch (error) {
                console.log('  ⚠️ Konnte node_modules nicht löschen - wird überschrieben');
            }
        }

        // Package-Lock-Dateien löschen
        const lockFiles = ['package-lock.json', 'yarn.lock'];
        lockFiles.forEach(file => {
            if (fs.existsSync(file) && file !== `${this.packageManager}-lock.yaml`) {
                try {
                    fs.unlinkSync(file);
                    console.log(`  🗑️ ${file} gelöscht`);
                } catch {}
            }
        });

        // npm cache clean
        if (this.packageManager === 'npm') {
            try {
                console.log('  🧹 npm cache clean...');
                execSync('npm cache clean --force', { stdio: 'ignore' });
            } catch {}
        }

        console.log('  ✅ Bereinigung abgeschlossen');
        console.log();
    }

    async installDependencies() {
        console.log('📦 Installiere Dependencies...');

        try {
            console.log(`  🔄 ${this.packageManager} install...`);

            let installCommand;
            switch (this.packageManager) {
                case 'pnpm':
                    installCommand = 'pnpm install --prefer-offline';
                    break;
                case 'yarn':
                    installCommand = 'yarn install --prefer-offline';
                    break;
                default:
                    installCommand = 'npm install --prefer-offline --no-audit';
            }

            execSync(installCommand, {
                stdio: 'inherit',
                timeout: 300000 // 5 Minuten Timeout
            });

            console.log('  ✅ Dependencies installiert');
        } catch (error) {
            console.log('\n❌ Installation fehlgeschlagen!');
            console.log('\n🔧 Lösungsversuche:');

            if (this.packageManager === 'pnpm') {
                console.log('1. pnpm cache löschen: pnpm store prune');
                console.log('2. Alternatives Registry: pnpm install --registry https://registry.npmjs.org/');
            } else if (this.packageManager === 'npm') {
                console.log('1. npm cache löschen: npm cache clean --force');
                console.log('2. Registry zurücksetzen: npm config delete registry');
                console.log('3. Als Administrator ausführen');
            }

            throw new Error(`Dependency Installation fehlgeschlagen: ${error.message}`);
        }

        console.log();
    }

    async collectConfiguration() {
        console.log('⚙️ Konfiguration sammeln...');
        console.log();

        // Datenbank Konfiguration
        console.log('📊 Datenbank-Einstellungen:');
        this.config.database.server = await this.askQuestion('SQL Server Adresse [116.202.224.248]: ') || '116.202.224.248';
        this.config.database.database = await this.askQuestion('Datenbank Name [RdScanner]: ') || 'RdScanner';
        this.config.database.user = await this.askQuestion('Benutzername [sa]: ') || 'sa';
        this.config.database.password = await this.askQuestion('Passwort: ', true);
        this.config.database.port = await this.askQuestion('Port [1433]: ') || '1433';

        console.log();

        // QR-Code Konfiguration
        console.log('📸 QR-Scanner Einstellungen:');
        const assignmentModes = ['last_login', 'round_robin', 'manual'];
        console.log('Verfügbare Modi:');
        assignmentModes.forEach((mode, index) => {
            console.log(`  ${index + 1}. ${mode}`);
        });

        const modeChoice = await this.askQuestion('QR-Zuordnungsmodus [1-3, default: 1]: ') || '1';
        this.config.qr = {
            assignmentMode: assignmentModes[parseInt(modeChoice) - 1] || 'last_login',
            duplicateCheck: await this.askYesNo('QR-Duplikat-Verhinderung aktivieren?', true),
            globalCooldown: await this.askQuestion('Globales QR-Cooldown in Sekunden [300]: ') || '300'
        };

        console.log();

        // UI Konfiguration
        console.log('🎨 Benutzeroberfläche:');
        this.config.ui = {
            width: await this.askQuestion('Fensterbreite [1200]: ') || '1200',
            height: await this.askQuestion('Fensterhöhe [800]: ') || '800',
            theme: await this.askQuestion('Theme [default/dark/light, default: default]: ') || 'default'
        };

        console.log();

        // RFID Konfiguration
        console.log('🏷️ RFID-Reader Einstellungen:');
        this.config.rfid = {
            scanInterval: await this.askQuestion('Min. Scan-Interval in ms [1000]: ') || '1000',
            inputTimeout: await this.askQuestion('Input-Timeout in ms [500]: ') || '500'
        };

        console.log();
    }

    async createEnvironmentFile() {
        console.log('📝 Erstelle .env Datei...');

        const envContent = `# RFID QR Wareneingang - Electron Konfiguration
# Automatisch generiert von Setup Script am ${new Date().toISOString()}

# Datenbank Konfiguration
MSSQL_SERVER=${this.config.database.server}
MSSQL_DATABASE=${this.config.database.database}
MSSQL_USER=${this.config.database.user}
MSSQL_PASSWORD=${this.config.database.password}
MSSQL_PORT=${this.config.database.port}
MSSQL_ENCRYPT=false
MSSQL_TRUST_CERT=true
MSSQL_REQUEST_TIMEOUT=30000
MSSQL_CONNECTION_TIMEOUT=15000

# QR-Code Konfiguration
QR_DEFAULT_ASSIGNMENT_MODE=${this.config.qr.assignmentMode}
QR_DUPLICATE_CHECK=${this.config.qr.duplicateCheck}
QR_GLOBAL_COOLDOWN=${this.config.qr.globalCooldown}
QR_SESSION_COOLDOWN=3600
QR_CROSS_USER_CHECK=true

# RFID Konfiguration
RFID_MIN_SCAN_INTERVAL=${this.config.rfid.scanInterval}
RFID_INPUT_TIMEOUT=${this.config.rfid.inputTimeout}
RFID_MAX_BUFFER_LENGTH=15

# UI Konfiguration
UI_WINDOW_WIDTH=${this.config.ui.width}
UI_WINDOW_HEIGHT=${this.config.ui.height}
UI_MIN_WIDTH=1000
UI_MIN_HEIGHT=600
UI_THEME=${this.config.ui.theme}
UI_SHOW_DEBUG=false
UI_UPDATE_INTERVAL=1000
UI_STATUS_TIMEOUT=5000

# Anwendung
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

        // Datenbank Test
        console.log('  🔄 Teste Datenbankverbindung...');
        try {
            const DatabaseClient = require('./db/db-client');
            const dbClient = new DatabaseClient();

            await dbClient.connect();
            const healthCheck = await dbClient.healthCheck();

            if (healthCheck.connected) {
                console.log('  ✅ Datenbankverbindung erfolgreich');
                console.log(`    Server: ${healthCheck.server?.DatabaseName}`);
                console.log(`    Zeit: ${healthCheck.connectionTime}ms`);
            } else {
                throw new Error(healthCheck.error);
            }

            await dbClient.close();

        } catch (error) {
            console.log(`  ❌ Datenbankverbindung fehlgeschlagen: ${error.message}`);

            const retry = await this.askYesNo('Möchten Sie die Datenbank-Einstellungen korrigieren?', true);
            if (retry) {
                console.log('\n📊 Datenbank-Einstellungen korrigieren:');
                this.config.database.server = await this.askQuestion(`SQL Server [${this.config.database.server}]: `) || this.config.database.server;
                this.config.database.user = await this.askQuestion(`Benutzername [${this.config.database.user}]: `) || this.config.database.user;
                this.config.database.password = await this.askQuestion('Neues Passwort: ', true) || this.config.database.password;

                // .env aktualisieren
                await this.createEnvironmentFile();

                // Erneut testen
                return this.testConnections();
            } else {
                console.log('  ⚠️ Fahre ohne Datenbanktest fort');
            }
        }

        console.log();
    }

    async finalizeSetup() {
        console.log('🎯 Finalisiere Setup...');

        // Verzeichnisse erstellen
        const directories = ['logs', 'temp', 'backup', 'build'];
        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`  ✅ Verzeichnis erstellt: ${dir}/`);
            }
        });

        // Einfaches Icon erstellen (falls nicht vorhanden)
        const iconPath = path.join('build', 'icon.ico');
        if (!fs.existsSync(iconPath)) {
            console.log('  ℹ️ Kein Icon gefunden - erstellen Sie build/icon.ico für professionelle Builds');
        }

        // Start-Script erstellen
        const startScript = `@echo off
echo Starte RFID QR Wareneingang...
cd /d "%~dp0"
${this.packageManager} start
pause`;

        fs.writeFileSync('start.bat', startScript);
        console.log('  ✅ start.bat erstellt');

        console.log();
    }

    async askQuestion(question, isPassword = false) {
        return new Promise((resolve) => {
            if (isPassword) {
                // Simple password input (without hiding characters for simplicity)
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

// Script starten wenn direkt aufgerufen
if (require.main === module) {
    const setup = new ElectronSetup();
    setup.run().catch(console.error);
}

module.exports = ElectronSetup;