#!/usr/bin/env node
/**
 * Entfernt alle Babel-Konfigurationsdateien
 */

const fs = require('fs');
const path = require('path');

console.log('🧹 Babel Configuration Cleanup');
console.log('==============================\n');

const babelFiles = [
    '.babelrc',
    '.babelrc.js',
    '.babelrc.json',
    'babel.config.js',
    'babel.config.json'
];

let removedCount = 0;

babelFiles.forEach(file => {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
        // Backup
        const backupPath = `${filePath}.backup-${Date.now()}`;
        fs.renameSync(filePath, backupPath);
        console.log(`✅ ${file} -> ${path.basename(backupPath)}`);
        removedCount++;
    }
});

if (removedCount > 0) {
    console.log(`\n✨ ${removedCount} Babel-Konfigurationsdatei(en) entfernt`);
    console.log('💡 Backups wurden erstellt falls du sie zurück brauchst');
} else {
    console.log('ℹ️  Keine Babel-Konfigurationsdateien gefunden');
}

console.log('\n🚀 Nächste Schritte:');
console.log('   1. pnpm test ausführen');
console.log('   2. Bei Problemen: node scripts/ultimate-test-fix.js');