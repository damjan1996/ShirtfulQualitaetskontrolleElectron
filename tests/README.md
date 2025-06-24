# 🧪 RFID QR System - Test Suite

Comprehensive test suite for the RFID QR Wareneingang system.

## 📋 Test Structure

```
tests/
├── unit/                    # Unit Tests - individual components
│   ├── rfid-listener.test.js
│   ├── db-client.test.js
│   └── qr-scanner.test.js
├── integrations/            # Integration Tests - component interaction
│   ├── rfid-database-integration.test.js
│   └── frontend-backend-integration.test.js
├── e2e/                     # End-to-End Tests - full workflows
│   ├── login-workflow.test.js
│   └── scan-workflow.test.js
├── mocks/                   # Mock implementations
│   ├── rfid-listener.mock.js
│   ├── db-client.mock.js
│   └── main-app.mock.js
├── frontend/                # Frontend-specific tests
│   └── renderer.test.js
├── setup.js                 # Global test setup
├── custom-matchers.js       # Custom Jest matchers
├── global-setup.js          # Jest global setup
├── global-teardown.js       # Jest global teardown
└── README.md               # This file
```

## 🚀 Running Tests

### Quick Start
```bash
# Install dependencies
npm install

# Run all tests
npm test

# Quick test (essential tests only)
npm run test-quick
```

### Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests with standard output |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:ci` | Run tests in CI mode (no watch) |
| `npm run test:unit` | Run only unit tests |
| `npm run test:integration` | Run only integration tests |
| `npm run test:e2e` | Run only end-to-end tests |
| `npm run test:mocks` | Run only mock tests |
| `npm run test:verbose` | Run tests with verbose output |
| `npm run test:silent` | Run tests with minimal output |
| `npm run test:debug` | Run tests with Node.js inspector |
| `npm run test-quick` | Run quick essential tests |

### Advanced Test Options

```bash
# Run specific test file
npm test -- tests/unit/rfid-listener.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should handle"

# Run tests with coverage for specific files
npm test -- --coverage --collectCoverageFrom="rfid/**/*.js"

# Debug specific test
npm run test:debug -- --testNamePattern="should simulate tag"
```

## 🏗️ Test Architecture

### Mock System
Our test suite uses a comprehensive mock system:

- **Hardware Mocks**: Simulate RFID readers and cameras
- **Database Mocks**: In-memory database operations
- **Electron Mocks**: Mock Electron APIs and IPC
- **File System Mocks**: Mock file operations

### Custom Matchers
Custom Jest matchers for domain-specific assertions:

```javascript
expect(tagId).toBeValidRFIDTag();
expect(qrCode).toBeValidQRCode();
expect(session).toBeValidSession();
expect(user).toBeValidUser();
expect(dbClient).toBeConnectedDatabase();
expect(rfidListener).toBeRunningRFIDListener();
```

### Test Utilities
Global test utilities available in all tests:

```javascript
// Timing utilities
await testUtils.delay(100);

// Mock reset
testUtils.resetAllMocks();

// Data generators
const tag = testUtils.generateRFIDTag();
const user = testUtils.generateUser();
const session = testUtils.generateSession();

// Debug utilities
testUtils.logMockState();
```

## 📊 Test Categories

### Unit Tests
Test individual components in isolation:

- **RFID Listener**: Tag detection, validation, events
- **Database Client**: SQL operations, connection handling
- **QR Scanner**: Code detection, error handling
- **Main Application**: Core business logic

### Integration Tests
Test component interactions:

- **RFID ↔ Database**: User lookup, session management
- **Frontend ↔ Backend**: IPC communication, UI updates
- **Hardware ↔ Software**: Mock hardware interactions

### End-to-End Tests
Test complete user workflows:

- **Login Flow**: RFID scan → User lookup → Session creation
- **Scan Flow**: QR scan → Data validation → Database storage
- **Error Flow**: Invalid inputs → Error handling → Recovery

### Performance Tests
Test system performance:

- **Load Testing**: Multiple rapid scans
- **Memory Testing**: Long-running sessions
- **Stress Testing**: Error conditions

## 🔧 Configuration

### Jest Configuration
Main configuration in `jest.config.js`:

- Test environment: Node.js
- Setup files: Global setup and custom matchers
- Coverage reporting: HTML, LCOV, JSON
- Timeout: 10 seconds per test
- Parallel execution: 50% of CPU cores

### Environment Variables
Test-specific environment variables:

```bash
NODE_ENV=test
TEST_MODE=true
MOCK_HARDWARE=true
TEST_DATABASE=true
JEST_SILENT=false
```

### Mock Configuration
Mock behavior can be configured:

```javascript
// Enable hardware error simulation
mockRFIDListener.enableHardwareError();

// Set database timeout simulation
mockDBClient.simulateTimeout(true);

// Configure error rates
mockDBClient.enableErrorSimulation(0.1); // 10% error rate
```

## 🐛 Debugging Tests

### Debug Mode
Run tests with debugging enabled:

```bash
npm run test:debug
```

Then connect with Chrome DevTools to `chrome://inspect`.

### Verbose Logging
Enable detailed logging:

```bash
npm run test:verbose
```

### Mock State Debugging
Check mock state during tests:

```javascript
beforeEach(() => {
    testUtils.logMockState();
});
```

### Test Isolation
Each test runs in isolation:

- Fresh mock instances per test
- Cleaned global state
- Reset event listeners
- Cleared timeouts

## 📈 Coverage Reports

Coverage reports are generated in multiple formats:

- **HTML**: `coverage/lcov-report/index.html`
- **LCOV**: `coverage/lcov.info`
- **JSON**: `coverage/coverage-final.json`
- **Text**: Console output

### Coverage Thresholds
Minimum coverage requirements:

- **Branches**: 70%
- **Functions**: 70%
- **Lines**: 70%
- **Statements**: 70%

## 🚨 Common Issues

### Port Conflicts
If tests fail due to port conflicts:

```bash
# Kill processes on common ports
npx kill-port 3000 5000 8080
```

### Memory Issues
For memory-related test failures:

```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

### Mock Setup Issues
If mocks aren't working properly:

```javascript
// Verify mock setup
describe('Mock Verification', () => {
    test('should have valid mock setup', () => {
        expect(global.mockElectron).toBeDefined();
        expect(global.mockHardware).toBeDefined();
    });
});
```

### Database Connection Issues
For database-related test failures:

```bash
# Test database connection separately
npm run test-db
```

## 🔄 Continuous Integration

### GitHub Actions
Tests run automatically on:

- Push to main branch
- Pull requests
- Scheduled daily runs

### Test Reports
CI generates test reports:

- JUnit XML: `test-results/jest-results.xml`
- Coverage: `coverage/lcov.info`
- Performance: `test-results/performance.json`

## 📝 Writing New Tests

### Test Template
Use this template for new tests:

```javascript
const MockComponent = require('../mocks/component.mock');

describe('Component Name', () => {
    let component;

    beforeEach(() => {
        component = new MockComponent();
        // Setup specific to this test suite
    });

    afterEach(() => {
        // Cleanup
        if (component) {
            component.cleanup();
        }
    });

    describe('Feature Group', () => {
        test('should do something specific', async () => {
            // Arrange
            const input = 'test-input';

            // Act
            const result = await component.method(input);

            // Assert
            expect(result).toBeDefined();
            expect(component.stats.calls).toBe(1);
        });
    });
});
```

### Best Practices

1. **AAA Pattern**: Arrange, Act, Assert
2. **Descriptive Names**: Clear test and describe block names
3. **Single Responsibility**: One assertion per test (generally)
4. **Test Isolation**: No dependencies between tests
5. **Mock Everything**: External dependencies should be mocked
6. **Error Testing**: Test both success and failure cases
7. **Edge Cases**: Test boundary conditions
8. **Performance**: Keep tests fast (< 1 second each)

### Custom Matchers
Create custom matchers for domain-specific assertions:

```javascript
expect.extend({
    toBeValidWorkflow(received) {
        // Custom validation logic
        return {
            message: () => `Expected ${received} to be valid workflow`,
            pass: /* validation result */
        };
    }
});
```

## 🔍 Test Data

### Test Users
Predefined test users:

```javascript
const testUsers = [
    { id: 1, name: 'Test User 1', epc: '53004114' },
    { id: 2, name: 'Test User 2', epc: '53004115' },
    { id: 3, name: 'Test User 3', epc: '53004116' }
];
```

### Test Tags
Valid RFID tags for testing:

```javascript
const testTags = [
    '53004114', '53004115', '53004116',
    'ABCDEF01', '12345678', 'FEDCBA98'
];
```

### Test QR Codes
Sample QR codes for testing:

```javascript
const testQRCodes = [
    'QR-12345-ABC',
    'PACKAGE-001-XYZ',
    '{"type":"package","id":"001"}'
];
```

## 🎯 Test Goals

Our test suite aims to ensure:

- **Reliability**: System works correctly under various conditions
- **Performance**: Acceptable response times and resource usage
- **Security**: No unauthorized access or data leaks
- **Usability**: Intuitive user interactions
- **Maintainability**: Code is easy to modify and extend
- **Compatibility**: Works across different environments

## 📞 Support

For test-related issues:

1. Check the troubleshooting section above
2. Review test logs in `test-results/`
3. Run tests in debug mode for detailed output
4. Contact the development team

---

**Happy Testing! 🧪✨**