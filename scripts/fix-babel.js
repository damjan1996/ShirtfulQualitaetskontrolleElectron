#!/usr/bin/env node
/**
 * Fix für Babel preset-env Fehler
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Babel Preset Fix');
console.log('==================\n');

console.log('Das Problem: @babel/preset-env fehlt\n');
console.log('Wähle eine Lösung:\n');
console.log('1. Babel aus Jest-Config entfernen (Empfohlen - Schnellste Lösung)');
console.log('2. @babel/preset-env installieren (Falls du ES6+ Features brauchst)');
console.log('3. Abbrechen\n');

const readline = require('readline');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function removeBabelFromJest() {
    try {
        const jestConfigPath = path.join(process.cwd(), 'jest.config.js');

        // Backup
        const backupPath = `${jestConfigPath}.backup-${Date.now()}`;
        fs.copyFileSync(jestConfigPath, backupPath);
        console.log(`💾 Backup erstellt: ${path.basename(backupPath)}`);

        // Lese Config
        let config = fs.readFileSync(jestConfigPath, 'utf8');

        // Entferne transform Block
        config = config.replace(/\/\/\s*Transform-Optionen[\s\S]*?(?=\/\/|$)/m, '');
        config = config.replace(/transform:\s*{[\s\S]*?},\s*/m, 'transform: {},\n    ');

        // Schreibe zurück
        fs.writeFileSync(jestConfigPath, config);
        console.log('✅ Babel aus jest.config.js entfernt');
        console.log('🚀 Die Tests verwenden jetzt natives Node.js');
        console.log('\nFühre aus: pnpm test');
    } catch (error) {
        console.error('❌ Fehler:', error.message);
    }
}

function installBabelPreset() {
    try {
        console.log('📦 Installiere @babel/preset-env...');
        execSync('pnpm add -D @babel/preset-env', { stdio: 'inherit' });
        console.log('\n✅ @babel/preset-env installiert');
        console.log('🚀 Du kannst jetzt "pnpm test" ausführen');
    } catch (error) {
        console.error('❌ Installation fehlgeschlagen:', error.message);
        console.log('\n💡 Alternative Befehle:');
        console.log('   npm install --save-dev @babel/preset-env');
        console.log('   yarn add -D @babel/preset-env');
    }
}

rl.question('Deine Wahl (1/2/3): ', (answer) => {
    console.log('');

    switch(answer) {
        case '1':
            removeBabelFromJest();
            break;
        case '2':
            installBabelPreset();
            break;
        case '3':
            console.log('Abgebrochen');
            break;
        default:
            console.log('Ungültige Wahl');
    }

    rl.close();
});