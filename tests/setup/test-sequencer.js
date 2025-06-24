// tests/setup/test-sequencer.js
/**
 * Test-Sequencer für deterministische Test-Reihenfolge
 * Stellt sicher, dass Tests in einer logischen Reihenfolge ausgeführt werden
 */

const Sequencer = require('@jest/test-sequencer').default;

class CustomTestSequencer extends Sequencer {
    sort(tests) {
        // Kopie erstellen, um das Original nicht zu mutieren
        const testsCopy = Array.from(tests);

        // Definiere die gewünschte Reihenfolge
        const testOrder = [
            // 1. Unit Tests zuerst (schnell und fundamental)
            'unit',
            'mocks',

            // 2. Integration Tests
            'integration',

            // 3. Frontend Tests
            'frontend',

            // 4. End-to-End Tests zuletzt (langsam)
            'e2e'
        ];

        return testsCopy.sort((testA, testB) => {
            const getTestPriority = (test) => {
                const testPath = test.path;

                // Bestimme die Priorität basierend auf dem Pfad
                for (let i = 0; i < testOrder.length; i++) {
                    if (testPath.includes(`/${testOrder[i]}/`) || testPath.includes(`\\${testOrder[i]}\\`)) {
                        return i;
                    }
                }

                // Standard-Priorität für unbekannte Tests
                return testOrder.length;
            };

            const priorityA = getTestPriority(testA);
            const priorityB = getTestPriority(testB);

            // Wenn die Prioritäten unterschiedlich sind, sortiere nach Priorität
            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Wenn die Prioritäten gleich sind, sortiere alphabetisch
            return testA.path.localeCompare(testB.path);
        });
    }
}

module.exports = CustomTestSequencer;