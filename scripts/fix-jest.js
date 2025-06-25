#!/usr/bin/env node
/**
 * Fix für Jest Konfigurationskonflikt
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Jest Configuration Fix');
console.log('=========================\n');

const packageJsonPath = path.join(process.cwd(), 'package.json');

try {
    // Lese package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    // Prüfe ob jest config existiert
    if (packageJson.jest) {
        console.log('📦 Jest Konfiguration in package.json gefunden');

        // Backup erstellen
        const backupPath = `${packageJsonPath}.backup-${Date.now()}`;
        fs.copyFileSync(packageJsonPath, backupPath);
        console.log(`💾 Backup erstellt: ${path.basename(backupPath)}`);

        // Entferne jest config
        delete packageJson.jest;

        // Schreibe package.json zurück
        fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
        console.log('✅ Jest Konfiguration aus package.json entfernt');
        console.log('✅ jest.config.js wird jetzt verwendet');
    } else {
        console.log('ℹ️  Keine Jest Konfiguration in package.json gefunden');
    }

    // Prüfe ob jest.config.js existiert
    const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
    if (fs.existsSync(jestConfigPath)) {
        console.log('✅ jest.config.js existiert');
    } else {
        console.log('❌ jest.config.js fehlt!');
        console.log('💡 Kopiere jest.config.js aus den bereitgestellten Artefakten');
    }

    console.log('\n✨ Fix abgeschlossen!');
    console.log('🚀 Du kannst jetzt "pnpm test" ausführen');

} catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
}