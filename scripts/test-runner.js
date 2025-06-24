// scripts/test-runner.js
/**
 * Test Runner Script für RFID QR Wareneingang
 * Orchestriert verschiedene Test-Szenarien
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class TestRunner {
    constructor() {
        this.projectRoot = path.resolve(__dirname, '..');
        this.testResults = {
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                skipped: 0,
                duration: 0
            },
            suites: {},
            coverage: null,
            errors: []
        };
        this.startTime = Date.now();
    }

    // Führt alle Tests aus
    async runAll(options = {}) {
        console.log('🚀 Starting complete test suite...\n');

        const testSuites = [
            { name: 'mocks', description: 'Mock Components' },
            { name: 'unit', description: 'Unit Tests' },
            { name: 'integration', description: 'Integration Tests' },
            { name: 'frontend', description: 'Frontend Tests' },
            { name: 'e2e', description: 'End-to-End Tests' }
        ];

        for (const suite of testSuites) {
            if (options.skipE2E && suite.name === 'e2e') {
                console.log(`⏭️  Skipping ${suite.description} (--skip-e2e flag)`);
                continue;
            }

            console.log(`📋 Running ${suite.description}...`);
            await this.runTestSuite(suite.name, options);
        }

        await this.generateReport(options);
        return this.testResults;
    }

    // Führt eine spezifische Test-Suite aus
    async runTestSuite(suiteName, options = {}) {
        const testPattern = `tests/${suiteName}`;
        const jestArgs = [
            '--testPathPattern', testPattern,
            '--passWithNoTests'
        ];

        if (options.coverage) {
            jestArgs.push('--coverage');
        }

        if (options.verbose) {
            jestArgs.push('--verbose');
        }

        if (options.ci) {
            jestArgs.push('--ci', '--watchAll=false');
        }

        if (options.maxWorkers) {
            jestArgs.push('--maxWorkers', options.maxWorkers.toString());
        }

        try {
            const result = await this.executeJest(jestArgs);
            this.testResults.suites[suiteName] = result;

            // Aktualisiere Gesamtstatistiken
            this.testResults.summary.total += result.numTotalTests || 0;
            this.testResults.summary.passed += result.numPassedTests || 0;
            this.testResults.summary.failed += result.numFailedTests || 0;
            this.testResults.summary.skipped += result.numPendingTests || 0;

            console.log(`✅ ${suiteName} tests completed: ${result.numPassedTests || 0} passed, ${result.numFailedTests || 0} failed\n`);
        } catch (error) {
            console.error(`❌ ${suiteName} tests failed:`, error.message);
            this.testResults.errors.push({
                suite: suiteName,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    }

    // Führt nur schnelle Tests aus (Unit + Mocks)
    async runQuick(options = {}) {
        console.log('⚡ Running quick tests (unit + mocks)...\n');

        const quickSuites = ['mocks', 'unit'];

        for (const suite of quickSuites) {
            console.log(`📋 Running ${suite} tests...`);
            await this.runTestSuite(suite, { ...options, coverage: false });
        }

        await this.generateReport(options);
        return this.testResults;
    }

    // Führt Performance-Tests aus
    async runPerformance(options = {}) {
        console.log('⚡ Running performance tests...\n');

        const jestArgs = [
            '--testNamePattern', 'performance|stress|load|benchmark',
            '--verbose',
            '--runInBand' // Sequential für konsistente Performance-Messungen
        ];

        try {
            const result = await this.executeJest(jestArgs);
            this.testResults.suites.performance = result;
            console.log('✅ Performance tests completed\n');
        } catch (error) {
            console.error('❌ Performance tests failed:', error.message);
            this.testResults.errors.push({
                suite: 'performance',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        return this.testResults;
    }

    // Führt Smoke Tests aus
    async runSmoke(options = {}) {
        console.log('💨 Running smoke tests...\n');

        const jestArgs = [
            '--testNamePattern', 'should.*initialize|should.*connect|should.*start',
            '--passWithNoTests'
        ];

        try {
            const result = await this.executeJest(jestArgs);
            this.testResults.suites.smoke = result;
            console.log('✅ Smoke tests completed\n');
        } catch (error) {
            console.error('❌ Smoke tests failed:', error.message);
            this.testResults.errors.push({
                suite: 'smoke',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        return this.testResults;
    }

    // Führt Jest mit gegebenen Argumenten aus
    async executeJest(args) {
        return new Promise((resolve, reject) => {
            const jestCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
            const jestProcess = spawn(jestCommand, ['jest', ...args], {
                cwd: this.projectRoot,
                stdio: ['inherit', 'pipe', 'pipe'],
                env: {
                    ...process.env,
                    NODE_ENV: 'test',
                    FORCE_COLOR: '1'
                }
            });

            let stdout = '';
            let stderr = '';

            jestProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdout += output;
                process.stdout.write(output);
            });

            jestProcess.stderr.on('data', (data) => {
                const output = data.toString();
                stderr += output;
                process.stderr.write(output);
            });

            jestProcess.on('close', (code) => {
                const result = this.parseJestOutput(stdout, stderr);
                result.exitCode = code;

                if (code === 0) {
                    resolve(result);
                } else {
                    reject(new Error(`Jest exited with code ${code}\n${stderr}`));
                }
            });

            jestProcess.on('error', (error) => {
                reject(new Error(`Failed to start Jest: ${error.message}`));
            });
        });
    }

    // Parst Jest-Output für Statistiken
    parseJestOutput(stdout, stderr) {
        const result = {
            numTotalTests: 0,
            numPassedTests: 0,
            numFailedTests: 0,
            numPendingTests: 0,
            numTodoTests: 0,
            testResults: [],
            coverageMap: null,
            success: false
        };

        // Extrahiere Test-Statistiken aus Jest Output
        const testSummaryMatch = stdout.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/);
        if (testSummaryMatch) {
            result.numFailedTests = parseInt(testSummaryMatch[1]);
            result.numPassedTests = parseInt(testSummaryMatch[2]);
            result.numTotalTests = parseInt(testSummaryMatch[3]);
        }

        // Alternative Pattern für erfolgreiche Tests
        const passedOnlyMatch = stdout.match(/Tests:\s+(\d+)\s+passed,\s+(\d+)\s+total/);
        if (passedOnlyMatch) {
            result.numPassedTests = parseInt(passedOnlyMatch[1]);
            result.numTotalTests = parseInt(passedOnlyMatch[2]);
        }

        // Extrahiere Pending/Skipped Tests
        const pendingMatch = stdout.match(/(\d+)\s+skipped/);
        if (pendingMatch) {
            result.numPendingTests = parseInt(pendingMatch[1]);
        }

        result.success = result.numFailedTests === 0 && result.numTotalTests > 0;

        return result;
    }

    // Generiert Test-Report
    async generateReport(options = {}) {
        this.testResults.summary.duration = Date.now() - this.startTime;

        const reportData = {
            timestamp: new Date().toISOString(),
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                env: process.env.NODE_ENV || 'test'
            },
            configuration: {
                coverage: options.coverage || false,
                ci: options.ci || false,
                verbose: options.verbose || false
            },
            results: this.testResults
        };

        // Speichere JSON-Report
        const reportsDir = path.join(this.projectRoot, 'test-reports');
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const reportFile = path.join(reportsDir, `test-report-${Date.now()}.json`);
        fs.writeFileSync(reportFile, JSON.stringify(reportData, null, 2));

        // Generiere Console-Report
        this.printReport();

        // Generiere HTML-Report wenn Coverage aktiviert
        if (options.coverage && fs.existsSync(path.join(this.projectRoot, 'coverage'))) {
            console.log(`📊 Coverage report available at: coverage/index.html`);
        }

        console.log(`📄 Test report saved to: ${reportFile}`);
    }

    // Druckt Test-Report in Console
    printReport() {
        const { summary, suites, errors } = this.testResults;

        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));

        console.log(`Total Tests: ${summary.total}`);
        console.log(`✅ Passed: ${summary.passed}`);
        console.log(`❌ Failed: ${summary.failed}`);
        console.log(`⏭️  Skipped: ${summary.skipped}`);
        console.log(`⏱️  Duration: ${(summary.duration / 1000).toFixed(2)}s`);

        if (summary.total > 0) {
            const successRate = ((summary.passed / summary.total) * 100).toFixed(1);
            console.log(`📈 Success Rate: ${successRate}%`);
        }

        // Suite Details
        console.log('\n📋 TEST SUITES:');
        for (const [suiteName, suiteResult] of Object.entries(suites)) {
            const status = suiteResult.success ? '✅' : '❌';
            const tests = `${suiteResult.numPassedTests || 0}/${suiteResult.numTotalTests || 0}`;
            console.log(`  ${status} ${suiteName}: ${tests} tests passed`);
        }

        // Errors
        if (errors.length > 0) {
            console.log('\n❌ ERRORS:');
            errors.forEach((error, index) => {
                console.log(`  ${index + 1}. ${error.suite}: ${error.error}`);
            });
        }

        // Fazit
        const overallSuccess = summary.failed === 0 && summary.total > 0;
        console.log('\n' + '='.repeat(60));
        if (overallSuccess) {
            console.log('🎉 ALL TESTS PASSED!');
        } else {
            console.log('💥 SOME TESTS FAILED!');
        }
        console.log('='.repeat(60) + '\n');
    }

    // Überwacht Test-Dateien und führt Tests bei Änderungen aus
    async watch(options = {}) {
        console.log('👀 Starting test watcher...\n');

        const jestArgs = [
            '--watch',
            '--verbose'
        ];

        if (options.coverage) {
            jestArgs.push('--coverage');
        }

        try {
            await this.executeJest(jestArgs);
        } catch (error) {
            console.error('❌ Test watcher failed:', error.message);
        }
    }

    // Räumt Test-Artefakte auf
    async cleanup() {
        console.log('🧹 Cleaning up test artifacts...');

        const cleanupPaths = [
            path.join(this.projectRoot, 'coverage'),
            path.join(this.projectRoot, '.nyc_output'),
            path.join(this.projectRoot, 'test-results'),
            path.join(this.projectRoot, 'test-reports')
        ];

        for (const cleanupPath of cleanupPaths) {
            if (fs.existsSync(cleanupPath)) {
                fs.rmSync(cleanupPath, { recursive: true, force: true });
                console.log(`  ✅ Removed: ${path.relative(this.projectRoot, cleanupPath)}`);
            }
        }

        console.log('✨ Cleanup completed\n');
    }

    // Validiert Test-Umgebung
    async validateEnvironment() {
        console.log('🔍 Validating test environment...\n');

        const checks = [
            {
                name: 'Node.js version',
                check: () => {
                    const version = process.version;
                    const majorVersion = parseInt(version.match(/v(\d+)/)[1]);
                    return majorVersion >= 16;
                },
                message: 'Node.js 16+ required'
            },
            {
                name: 'Jest installed',
                check: () => {
                    try {
                        require.resolve('jest');
                        return true;
                    } catch {
                        return false;
                    }
                },
                message: 'Jest not found - run npm install'
            },
            {
                name: 'Test directories',
                check: () => {
                    const testDir = path.join(this.projectRoot, 'tests');
                    return fs.existsSync(testDir);
                },
                message: 'Tests directory not found'
            },
            {
                name: 'Mock files',
                check: () => {
                    const mockDir = path.join(this.projectRoot, 'tests', 'mocks');
                    return fs.existsSync(mockDir) &&
                        fs.readdirSync(mockDir).length > 0;
                },
                message: 'Mock files not found'
            }
        ];

        let allPassed = true;

        for (const check of checks) {
            const passed = check.check();
            const status = passed ? '✅' : '❌';
            console.log(`  ${status} ${check.name}`);

            if (!passed) {
                console.log(`      ⚠️  ${check.message}`);
                allPassed = false;
            }
        }

        if (allPassed) {
            console.log('\n🎉 Test environment is ready!\n');
        } else {
            console.log('\n💥 Test environment has issues. Please fix them before running tests.\n');
            process.exit(1);
        }

        return allPassed;
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const command = args[0] || 'all';

    const options = {
        coverage: args.includes('--coverage'),
        verbose: args.includes('--verbose'),
        ci: args.includes('--ci'),
        skipE2E: args.includes('--skip-e2e'),
        maxWorkers: args.includes('--max-workers') ?
            parseInt(args[args.indexOf('--max-workers') + 1]) : undefined
    };

    const runner = new TestRunner();

    try {
        switch (command) {
            case 'all':
                await runner.validateEnvironment();
                await runner.runAll(options);
                break;

            case 'quick':
                await runner.runQuick(options);
                break;

            case 'performance':
                await runner.runPerformance(options);
                break;

            case 'smoke':
                await runner.runSmoke(options);
                break;

            case 'watch':
                await runner.watch(options);
                break;

            case 'cleanup':
                await runner.cleanup();
                break;

            case 'validate':
                await runner.validateEnvironment();
                break;

            default:
                console.log('Usage: node scripts/test-runner.js [command] [options]');
                console.log('');
                console.log('Commands:');
                console.log('  all         Run all test suites');
                console.log('  quick       Run unit and mock tests only');
                console.log('  performance Run performance tests');
                console.log('  smoke       Run smoke tests');
                console.log('  watch       Watch mode');
                console.log('  cleanup     Clean test artifacts');
                console.log('  validate    Validate test environment');
                console.log('');
                console.log('Options:');
                console.log('  --coverage  Generate coverage report');
                console.log('  --verbose   Verbose output');
                console.log('  --ci        CI mode');
                console.log('  --skip-e2e  Skip end-to-end tests');
                console.log('  --max-workers N  Set max workers');
                process.exit(1);
        }

        const overallSuccess = runner.testResults.summary.failed === 0;
        process.exit(overallSuccess ? 0 : 1);

    } catch (error) {
        console.error('💥 Test runner failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = TestRunner;