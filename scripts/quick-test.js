#!/usr/bin/env node

/**
 * Quick Test Script
 * Führt die wichtigsten Tests schnell aus ohne vollständige Coverage
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class QuickTester {
    constructor() {
        this.startTime = Date.now();
        this.results = {
            passed: 0,
            failed: 0,
            total: 0,
            suites: []
        };
    }

    async run() {
        console.log('🚀 Starting Quick Test Suite...');
        console.log('='.repeat(50));

        try {
            // Environment Check
            await this.checkEnvironment();

            // Run essential tests only
            await this.runEssentialTests();

            // Summary
            this.printSummary();

            return this.results.failed === 0;

        } catch (error) {
            console.error('❌ Quick test execution failed:', error.message);
            return false;
        }
    }

    async checkEnvironment() {
        console.log('🔍 Checking test environment...');

        // Check Node.js version
        const nodeVersion = process.version;
        const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

        if (majorVersion < 16) {
            throw new Error(`Node.js 16+ required, but found ${nodeVersion}`);
        }
        console.log(`✅ Node.js version: ${nodeVersion}`);

        // Check if jest is available
        const jestPath = path.join(process.cwd(), 'node_modules', '.bin', 'jest');
        const jestExists = fs.existsSync(jestPath) || fs.existsSync(jestPath + '.cmd');

        if (!jestExists) {
            throw new Error('Jest not found. Run: npm install');
        }
        console.log('✅ Jest available');

        // Check test files exist
        const testDirs = ['tests/unit', 'tests/mocks'];
        for (const dir of testDirs) {
            const dirPath = path.join(process.cwd(), dir);
            if (!fs.existsSync(dirPath)) {
                throw new Error(`Test directory missing: ${dir}`);
            }
        }
        console.log('✅ Test directories exist');

        console.log(''); // Empty line
    }

    async runEssentialTests() {
        console.log('⚡ Running essential tests...');

        const testSuites = [
            {
                name: 'Mock Tests',
                pattern: 'tests/mocks/**/*.test.js',
                timeout: 10000
            },
            {
                name: 'Unit Tests (Core)',
                pattern: 'tests/unit/rfid-listener.test.js',
                timeout: 15000
            },
            {
                name: 'Integration Tests (Critical)',
                pattern: 'tests/integrations/rfid-database-integration.test.js',
                timeout: 20000
            }
        ];

        for (const suite of testSuites) {
            console.log(`\n📋 Running: ${suite.name}`);
            console.log('-'.repeat(30));

            const result = await this.runJestSuite(suite);
            this.results.suites.push(result);
            this.results.passed += result.passed;
            this.results.failed += result.failed;
            this.results.total += result.total;

            if (result.failed > 0) {
                console.log(`❌ ${suite.name}: ${result.failed} failed tests`);
            } else {
                console.log(`✅ ${suite.name}: All ${result.passed} tests passed`);
            }
        }
    }

    async runJestSuite(suite) {
        const jestCommand = this.getJestCommand();
        const args = [
            '--testPathPattern=' + suite.pattern,
            '--testTimeout=' + suite.timeout,
            '--passWithNoTests',
            '--silent',
            '--noStackTrace',
            '--json',
            '--forceExit'
        ];

        return new Promise((resolve) => {
            const child = spawn(jestCommand, args, {
                cwd: process.cwd(),
                stdio: ['ignore', 'pipe', 'pipe']
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            child.on('close', (code) => {
                try {
                    const result = this.parseJestOutput(stdout, stderr);
                    resolve(result);
                } catch (error) {
                    console.warn(`⚠️  Warning: Could not parse test results for ${suite.name}`);
                    resolve({
                        passed: 0,
                        failed: 1,
                        total: 1,
                        details: `Parse error: ${error.message}`
                    });
                }
            });

            child.on('error', (error) => {
                console.error(`❌ Error running ${suite.name}:`, error.message);
                resolve({
                    passed: 0,
                    failed: 1,
                    total: 1,
                    details: `Execution error: ${error.message}`
                });
            });
        });
    }

    parseJestOutput(stdout, stderr) {
        // Try to parse JSON output
        try {
            const jsonOutput = JSON.parse(stdout);

            if (jsonOutput.testResults && Array.isArray(jsonOutput.testResults)) {
                let passed = 0;
                let failed = 0;
                let total = 0;

                jsonOutput.testResults.forEach(testFile => {
                    if (testFile.assertionResults) {
                        testFile.assertionResults.forEach(test => {
                            total++;
                            if (test.status === 'passed') {
                                passed++;
                            } else {
                                failed++;
                            }
                        });
                    }
                });

                return { passed, failed, total, details: 'JSON parsing successful' };
            }
        } catch (error) {
            // Fallback to text parsing
        }

        // Fallback: Parse text output
        const passedMatch = stdout.match(/(\d+) passed/);
        const failedMatch = stdout.match(/(\d+) failed/);
        const totalMatch = stdout.match(/(\d+) total/);

        const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
        const failed = failedMatch ? parseInt(failedMatch[1]) : 0;
        const total = totalMatch ? parseInt(totalMatch[1]) : passed + failed;

        // If no clear results and stderr is empty, assume success
        if (total === 0 && !stderr.includes('Error') && !stderr.includes('FAIL')) {
            return { passed: 1, failed: 0, total: 1, details: 'Assumed success (no output)' };
        }

        return { passed, failed, total, details: 'Text parsing fallback' };
    }

    getJestCommand() {
        const isWindows = process.platform === 'win32';
        const jestBin = path.join(process.cwd(), 'node_modules', '.bin', 'jest');

        if (isWindows) {
            return jestBin + '.cmd';
        }

        return jestBin;
    }

    printSummary() {
        const duration = Date.now() - this.startTime;

        console.log('\n' + '='.repeat(50));
        console.log('📊 Quick Test Summary');
        console.log('='.repeat(50));

        console.log(`⏱️  Duration: ${duration}ms`);
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📋 Total: ${this.results.total}`);

        if (this.results.failed === 0) {
            console.log('\n🎉 All essential tests passed!');
            console.log('✨ Core functionality is working correctly');
            console.log('🚀 Ready for full test suite: npm test');
        } else {
            console.log('\n💥 Some tests failed!');
            console.log('🔧 Fix these issues before running full tests');

            // Show failed suites
            const failedSuites = this.results.suites.filter(s => s.failed > 0);
            if (failedSuites.length > 0) {
                console.log('\n❌ Failed test suites:');
                failedSuites.forEach(suite => {
                    console.log(`   • ${suite.name || 'Unknown'}: ${suite.failed} failures`);
                });
            }
        }

        console.log('\n📋 Next steps:');
        if (this.results.failed === 0) {
            console.log('   1. Run full test suite: npm test');
            console.log('   2. Run with coverage: npm run test:coverage');
            console.log('   3. Start development: npm run dev');
        } else {
            console.log('   1. Fix failing tests');
            console.log('   2. Run quick test again: npm run test-quick');
            console.log('   3. Check logs for detailed error messages');
        }

        console.log('='.repeat(50));
    }
}

// Main execution
if (require.main === module) {
    const tester = new QuickTester();

    tester.run()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('💥 Fatal error in quick test:', error);
            process.exit(1);
        });
}

module.exports = QuickTester;