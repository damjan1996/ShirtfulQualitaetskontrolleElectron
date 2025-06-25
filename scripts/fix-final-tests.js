#!/usr/bin/env node
/**
 * Quick Fix Script für Test-Fehler
 * Behebt die häufigsten Test-Probleme automatisch
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Test Fix Script');
console.log('==================\n');

// 1. Installiere fehlende Dependencies
console.log('📦 Überprüfe Dependencies...');
const requiredDevDeps = [
    '@babel/core',
    '@babel/preset-env',
    'babel-jest',
    'jest',
    'jsdom',
    'mock-fs'
];

const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const missingDeps = requiredDevDeps.filter(dep =>
    !packageJson.devDependencies?.[dep] && !packageJson.dependencies?.[dep]
);

if (missingDeps.length > 0) {
    console.log(`❌ Fehlende Dependencies: ${missingDeps.join(', ')}`);
    console.log('💡 Führe aus: npm install --save-dev ' + missingDeps.join(' '));
} else {
    console.log('✅ Alle Test-Dependencies installiert');
}

// 2. Erstelle fehlende Verzeichnisse
console.log('\n📁 Überprüfe Verzeichnisstruktur...');
const requiredDirs = [
    'tests',
    'tests/unit',
    'tests/integrations',
    'tests/mocks',
    'tests/setup',
    'scripts'
];

requiredDirs.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Erstellt: ${dir}/`);
    }
});

// 3. Cleanup alte Test-Artefakte
console.log('\n🧹 Cleanup alte Test-Artefakte...');
const cleanupPaths = [
    'coverage',
    '.nyc_output',
    'test-results'
];

cleanupPaths.forEach(cleanPath => {
    const fullPath = path.join(process.cwd(), cleanPath);
    if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`✅ Gelöscht: ${cleanPath}`);
    }
});

// 4. Überprüfe Umgebungsvariablen
console.log('\n🔐 Überprüfe Umgebungsvariablen...');
if (!fs.existsSync('.env')) {
    console.log('❌ .env Datei fehlt!');
    console.log('💡 Erstelle .env Datei mit folgenden Variablen:');
    console.log(`
MSSQL_SERVER=localhost
MSSQL_DATABASE=RdScanner_Test
MSSQL_USER=test_user
MSSQL_PASSWORD=test_password
MSSQL_PORT=1433
MSSQL_ENCRYPT=false
MSSQL_TRUST_CERT=true
`);
} else {
    console.log('✅ .env Datei vorhanden');
}

// 5. Jest Cache löschen
console.log('\n🗑️ Jest Cache löschen...');
try {
    const { execSync } = require('child_process');
    execSync('npx jest --clearCache', { stdio: 'pipe' });
    console.log('✅ Jest Cache gelöscht');
} catch (error) {
    console.log('⚠️  Jest Cache konnte nicht gelöscht werden');
}

// 6. Zusammenfassung
console.log('\n' + '='.repeat(50));
console.log('📊 ZUSAMMENFASSUNG');
console.log('='.repeat(50));

console.log('\n📋 Nächste Schritte:\n');

let step = 1;
if (missingDeps.length > 0) {
    console.log(`${step++}. Dependencies installieren:`);
    console.log(`   npm install --save-dev ${missingDeps.join(' ')}\n`);
}

console.log(`${step++}. Tests ausführen:`);
console.log('   npm test\n');

console.log(`${step++}. Bei weiteren Fehlern:`);
console.log('   - Überprüfe die Konsolen-Ausgabe');
console.log('   - Stelle sicher, dass alle Mock-Dateien vorhanden sind');
console.log('   - Führe npm run test:debug für detaillierte Fehleranalyse aus\n');

console.log('💡 Tipp: Verwende npm run test-quick für schnelle Tests\n');

console.log('🚀 Viel Erfolg!\n');