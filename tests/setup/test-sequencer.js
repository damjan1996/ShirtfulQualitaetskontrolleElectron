// tests/setup/test-sequencer.js
/**
 * Custom Test Sequencer für deterministische Test-Reihenfolge
 * Stellt sicher, dass Tests in der richtigen Reihenfolge ausgeführt werden
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomTestSequencer extends Sequencer {
    /**
     * Sortiert Tests in einer bestimmten Reihenfolge
     * @param {Array} tests - Array von Test-Dateien
     * @returns {Array} Sortierte Test-Dateien
     */
    sort(tests) {
        // Definiere Test-Prioritäten (niedrigere Zahlen = frühere Ausführung)
        const testPriorities = {
            // Setup und Mocks zuerst
            'setup': 1,
            'mocks': 2,

            // Unit Tests
            'unit': 3,

            // Integration Tests
            'integration': 4,

            // Frontend Tests
            'frontend': 5,

            // End-to-End Tests zuletzt
            'e2e': 6
        };

        // Spezifische Test-Datei Prioritäten
        const specificPriorities = {
            // Jest Setup zuerst
            'jest.setup.js': 0,
            'test-sequencer.js': 0,

            // Mocks vor allem anderen
            'electron.mock.js': 1,
            'mssql.mock.js': 1,
            'node-hid.mock.js': 1,
            'db-client.mock.js': 2,
            'rfid-listener.mock.js': 2,
            'qr-scanner.mock.js': 2,

            // Core Unit Tests
            'db-client.test.js': 10,
            'rfid-listener.test.js': 11,
            'preload.test.js': 12,
            'main.test.js': 13,

            // Integration Tests
            'rfid-database-integration.test.js': 20,
            'frontend-backend-integration.test.js': 21,
            'complete-workflow.test.js': 22,

            // Frontend Tests
            'ui-components.test.js': 30,

            // E2E Tests zuletzt
            'app-startup.test.js': 40,
            'full-workflow.test.js': 41
        };

        return tests.sort((testA, testB) => {
            // Extrahiere Dateinamen
            const fileNameA = this.getFileName(testA.path);
            const fileNameB = this.getFileName(testB.path);

            // Prüfe spezifische Prioritäten zuerst
            const specificPriorityA = specificPriorities[fileNameA];
            const specificPriorityB = specificPriorities[fileNameB];

            if (specificPriorityA !== undefined && specificPriorityB !== undefined) {
                return specificPriorityA - specificPriorityB;
            }

            if (specificPriorityA !== undefined) {
                return -1; // A hat Priorität
            }

            if (specificPriorityB !== undefined) {
                return 1; // B hat Priorität
            }

            // Verwende Ordner-basierte Prioritäten
            const categoryA = this.getTestCategory(testA.path);
            const categoryB = this.getTestCategory(testB.path);

            const priorityA = testPriorities[categoryA] || 999;
            const priorityB = testPriorities[categoryB] || 999;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Bei gleicher Priorität: alphabetisch sortieren
            return testA.path.localeCompare(testB.path);
        });
    }

    /**
     * Extrahiert den Dateinamen aus einem Pfad
     * @param {string} filePath - Dateipfad
     * @returns {string} Dateiname
     */
    getFileName(filePath) {
        return filePath.split(/[/\\]/).pop();
    }

    /**
     * Bestimmt die Test-Kategorie basierend auf dem Pfad
     * @param {string} filePath - Dateipfad
     * @returns {string} Kategorie
     */
    getTestCategory(filePath) {
        const pathParts = filePath.split(/[/\\]/);

        // Suche nach Kategorie-Ordnern
        if (pathParts.includes('setup')) return 'setup';
        if (pathParts.includes('mocks')) return 'mocks';
        if (pathParts.includes('unit')) return 'unit';
        if (pathParts.includes('integration')) return 'integration';
        if (pathParts.includes('frontend')) return 'frontend';
        if (pathParts.includes('e2e')) return 'e2e';

        // Fallback: bestimme Kategorie aus Dateiname
        const fileName = this.getFileName(filePath);

        if (fileName.includes('mock')) return 'mocks';
        if (fileName.includes('setup')) return 'setup';
        if (fileName.includes('integration')) return 'integration';
        if (fileName.includes('e2e') || fileName.includes('end-to-end')) return 'e2e';
        if (fileName.includes('frontend') || fileName.includes('ui')) return 'frontend';

        // Default: unit test
        return 'unit';
    }

    /**
     * Zusätzliche Logik für Test-Parallelisierung
     * Bestimmt, ob Tests parallel ausgeführt werden können
     * @param {Array} tests - Test-Dateien
     * @returns {Array} Tests gruppiert für Parallelisierung
     */
    shard(tests, options) {
        const { shardIndex, shardCount } = options;

        // Setup und Mocks sollten sequenziell laufen
        const sequentialTests = tests.filter(test => {
            const category = this.getTestCategory(test.path);
            return ['setup', 'mocks'].includes(category);
        });

        // Andere Tests können parallel laufen
        const parallelTests = tests.filter(test => {
            const category = this.getTestCategory(test.path);
            return !['setup', 'mocks'].includes(category);
        });

        // Verteilung für parallele Ausführung
        if (shardIndex === 0) {
            // Erster Shard führt sequenzielle Tests aus
            const shardSize = Math.ceil(parallelTests.length / shardCount);
            const startIndex = 0;
            const endIndex = shardSize;

            return [
                ...sequentialTests,
                ...parallelTests.slice(startIndex, endIndex)
            ];
        } else {
            // Andere Shards führen nur parallele Tests aus
            const shardSize = Math.ceil(parallelTests.length / shardCount);
            const startIndex = (shardIndex - 1) * shardSize + Math.ceil(parallelTests.length / shardCount);
            const endIndex = startIndex + shardSize;

            return parallelTests.slice(startIndex, endIndex);
        }
    }
}

module.exports = CustomTestSequencer;