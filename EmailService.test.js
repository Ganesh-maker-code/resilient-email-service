//EmailService.test.js

const EmailService = require('C:\\resilient-email-service\\EmailService');
const { mockProvider1, mockProvider2 } = require('C:\\resilient-email-service\\providers');
const { sleep } = require('C:\\resilient-email-service\\utils');

function createMockLogger() {
    const logs = [];
    return {
        log: (...args) => logs.push(args.join(' ')),
        error: (...args) => logs.push('ERROR: ' + args.join(' ')), // Include error method
        getLogs: () => logs,
        clearLogs: () => logs.length = 0
    };
}

async function runTests() {
    // Directly use console.log
    console.log('--- Starting Unit Tests for EmailService ---');

    let testCount = 0;
    let failedTests = 0;

    const assert = (condition, message) => {
        testCount++;
        if (condition) {
            // Directly use console.log
            console.log(`PASS Test #${testCount}: ${message}`);
        } else {
            failedTests++;
            // Directly use console.error
            console.error(`FAIL Test #${testCount}: ${message} (FAILED)`);
        }
    };

    // --- Test Case 1: Basic Email Sending ---
    console.log('\n--- Test Case 1: Basic Email Sending ---');
    const logger1 = createMockLogger();
    // Use a provider that always succeeds for this basic test
    const service1 = new EmailService([
        (to, sub, body) => mockProvider1(to, sub, body, 1.0) // 100% success rate
    ], { logger: logger1 });
    try {
        const emailId = 'test-basic-1';
        const result = await service1.sendEmail({
            emailId,
            to: 'test@example.com',
            subject: 'Basic Test',
            body: 'Hello'
        });
        assert(result.includes('Provider 1'), 'Should send email successfully via Provider 1');
        assert(service1.getEmailStatus(emailId) === 'sent', 'Email status should be "sent"');
    } catch (e) {
        assert(false, `Basic send failed: ${e.message}`);
    }

    // --- Test Case 2: Retry Mechanism ---
    console.log('\n--- Test Case 2: Retry Mechanism (Mocking failure then success) ---');
    let attemptCount = 0;
    const mockFlakyProvider = (to, subject, body) => {
        return new Promise((resolve, reject) => {
            attemptCount++;
            if (attemptCount === 1) {
                reject(new Error('Flaky provider failed on first attempt.'));
            } else {
                resolve('Success from flaky provider on retry.');
            }
        });
    };
    const logger2 = createMockLogger();
    // Pass the entire logger object
    const service2 = new EmailService([mockFlakyProvider], { maxRetries: 2, initialRetryDelay: 10, logger: logger2 });
    attemptCount = 0; // Reset for this test
    try {
        const emailId = 'test-retry-1';
        const result = await service2.sendEmail({
            emailId,
            to: 'flaky@example.com',
            subject: 'Retry Test',
            body: 'Retry me'
        });
        assert(result.includes('Success from flaky provider'), 'Should succeed after retry');
        assert(attemptCount === 2, 'Should have attempted 2 times (initial + 1 retry)');
        assert(service2.getEmailStatus(emailId) === 'sent', 'Email status should be "sent" after retry');
    } catch (e) {
        assert(false, `Retry test failed: ${e.message}`);
    }

    // --- Test Case 3: Fallback Mechanism ---
    console.log('\n--- Test Case 3: Fallback Mechanism (Provider 1 fails, Provider 2 succeeds) ---');
    const mockFailingProvider = (to, subject, body) => Promise.reject(new Error('Provider 1 always fails.'));
    // Ensure mockSuccessfulProvider always succeeds
    const mockSuccessfulProviderDeterm = (to, subject, body) => mockProvider2(to, subject, body, 1.0);
    const logger3 = createMockLogger();
    // Pass the entire logger object
    const service3 = new EmailService([mockFailingProvider, mockSuccessfulProviderDeterm], { maxRetries: 1, logger: logger3 });
    try {
        const emailId = 'test-fallback-1';
        const result = await service3.sendEmail({
            emailId,
            to: 'fallback@example.com',
            subject: 'Fallback Test',
            body: 'Fallback!'
        });
        assert(result.includes('Success from Provider 2'), 'Should fall back to Provider 2 and succeed');
        assert(logger3.getLogs().some(log => log.includes('Trying next provider...')), 'Should log fallback attempt');
        assert(service3.getEmailStatus(emailId) === 'sent', 'Email status should be "sent" after fallback');
    } catch (e) {
        assert(false, `Fallback test failed: ${e.message}`);
    }

    // --- Test Case 4: Idempotency ---
    console.log('\n--- Test Case 4: Idempotency ---');
    const logger4 = createMockLogger();
    // Use a provider that always succeeds for this test
    const service4 = new EmailService([
        (to, sub, body) => mockProvider1(to, sub, body, 1.0) // 100% success rate
    ], { idempotencyWindowMs: 500, logger: logger4 });
    const idempotentId = 'test-idempotency-1';
    try {
        await service4.sendEmail({
            emailId: idempotentId,
            to: 'idem@example.com',
            subject: 'Idempotency',
            body: 'First send'
        });
        const result2 = await service4.sendEmail({
            emailId: idempotentId,
            to: 'idem@example.com',
            subject: 'Idempotency',
            body: 'Second send'
        });
        assert(result2.includes('already sent'), 'Second send should indicate idempotency');
        assert(service4.getEmailStatus(idempotentId) === 'sent', 'Email status should remain "sent"');
    } catch (e) {
        assert(false, `Idempotency test failed: ${e.message}`);
    }

    // --- Test Case 5: Rate Limiting ---
    console.log('\n--- Test Case 5: Rate Limiting and Queueing ---');
    const logger5 = createMockLogger();
    // Use a provider that always succeeds for this test
    const service5 = new EmailService([
        (to, sub, body) => mockProvider1(to, sub, body, 1.0) // 100% success rate
    ], {
        rateLimitWindowMs: 100,
        maxRequestsPerWindow: 2,
        initialRetryDelay: 10,
        logger: logger5
    });
    const emailPromises = [];
    for (let i = 0; i < 5; i++) {
        const emailId = `test-ratelimit-${i}`;
        emailPromises.push(service5.sendEmail({
            emailId,
            to: `rl${i}@example.com`,
            subject: 'Rate Limit',
            body: `RL test ${i}`
        }).then(() => {
            assert(service5.getEmailStatus(emailId) === 'sent', `Email ${emailId} status should be "sent"`);
        }).catch(e => {
            assert(false, `Email ${emailId} failed due to rate limiting unexpectedly: ${e.message}`);
        }));
        await sleep(10); // Small delay to try and hit rate limit quickly
    }
    await Promise.all(emailPromises);
    assert(logger5.getLogs().some(log => log.includes('Rate limited: Too many requests.')), 'Should log rate limiting');
    await sleep(200); // Allow queue to drain to confirm all sent
    for (let i = 0; i < 5; i++) {
        const emailId = `test-ratelimit-${i}`;
        assert(service5.getEmailStatus(emailId) === 'sent', `All queued emails (id: ${emailId}) should eventually send`);
    }

    // --- Test Case 6: Circuit Breaker Opens ---
    console.log('\n--- Test Case 6: Circuit Breaker Opens ---');
    const mockFailingForeverProvider = (to, subject, body) => Promise.reject(new Error('Provider always fails for CB test.'));
    const logger6 = createMockLogger();
    // Pass the entire logger object
    const service6 = new EmailService([mockFailingForeverProvider], {
        maxRetries: 0, // No retries to quickly hit threshold
        circuitBreakerThreshold: 2,
        circuitBreakerTimeoutMs: 100, // Short timeout for testing
        logger: logger6
    });

    const cbEmailPrefix = 'test-cb-open-';
    try {
        await service6.sendEmail({ emailId: `${cbEmailPrefix}1`, to: 'cb@example.com', subject: 'CB', body: '1' });
    } catch (e) { assert(e.message.includes('Provider always fails'), `Email 1 should fail: ${e.message}`); } // Assert on specific error
    try {
        await service6.sendEmail({ emailId: `${cbEmailPrefix}2`, to: 'cb@example.com', subject: 'CB', body: '2' });
    } catch (e) { assert(e.message.includes('Provider always fails'), `Email 2 should fail: ${e.message}`); } // Assert on specific error
    assert(service6.circuitBreakers.get(mockFailingForeverProvider).isOpen, 'Circuit should be open after failures.');

    // Circuit should now be open and block immediately
    try {
        await service6.sendEmail({ emailId: `${cbEmailPrefix}3`, to: 'cb@example.com', subject: 'CB', body: '3' });
        assert(false, 'Email 3 should be blocked by open circuit (did not throw).'); // This should not be reached
    } catch (e) {
        assert(e.message.includes('Circuit open'), `Email 3 should fail due to circuit open: ${e.message}`);
    }
    assert(logger6.getLogs().some(log => log.includes('circuit is open. Blocking request.')), 'Should log circuit open blocking.');
    assert(service6.getEmailStatus(`${cbEmailPrefix}1`) === 'failed', 'Status of first failed email should be failed.');


    // --- Test Case 7: Circuit Breaker Half-Open and Close ---
    console.log('\n--- Test Case 7: Circuit Breaker Half-Open and Close ---');
    const logger7 = createMockLogger();
    const mockFlakyCbProvider = (() => {
        let failures = 0;
        return (to, subject, body) => {
            if (failures < 2) { // Fail twice to open circuit
                failures++;
                return Promise.reject(new Error(`Flaky CB: Failure ${failures}`));
            } else { // Then succeed once in half-open
                return Promise.resolve('Flaky CB: Success in half-open');
            }
        };
    })();
    // Pass the entire logger object
    const service7 = new EmailService([mockFlakyCbProvider], {
        maxRetries: 0,
        circuitBreakerThreshold: 2,
        circuitBreakerTimeoutMs: 100, // Short timeout
        circuitBreakerHalfOpenAttempts: 1,
        logger: logger7
    });

    const cbClosePrefix = 'test-cb-close-';
    try {
        await service7.sendEmail({ emailId: `${cbClosePrefix}1`, to: 'cbclose@example.com', subject: 'CB Close', body: '1' });
    } catch (e) { assert(e.message.includes('Flaky CB: Failure 1'), `CB Close Email 1 should fail: ${e.message}`); }
    try {
        await service7.sendEmail({ emailId: `${cbClosePrefix}2`, to: 'cbclose@example.com', subject: 'CB Close', body: '2' });
    } catch (e) { assert(e.message.includes('Flaky CB: Failure 2'), `CB Close Email 2 should fail: ${e.message}`); }
    assert(service7.circuitBreakers.get(mockFlakyCbProvider).isOpen, 'Circuit should be open after failures.');

    await sleep(150); // Wait for circuit to become half-open

    try {
        const result = await service7.sendEmail({ emailId: `${cbClosePrefix}3`, to: 'cbclose@example.com', subject: 'CB Close', body: '3' });
        assert(result.includes('Success in half-open'), 'Email 3 should succeed in half-open state.');
        assert(!service7.circuitBreakers.get(mockFlakyCbProvider).isOpen, 'Circuit should be closed after half-open success.');
    } catch (e) {
        assert(false, `CB Close Email 3 failed unexpectedly: ${e.message}`);
    }
    // Check specific log messages for half-open and closed states
    assert(logger7.getLogs().some(log => log.includes('Circuit for provider mockFlakyCbProvider is half-open.')), 'Should log half-open state.');
    assert(logger7.getLogs().some(log => log.includes('Circuit for provider mockFlakyCbProvider closed after successful half-open attempt.')), 'Should log circuit closed.');
    assert(service7.getEmailStatus(`${cbClosePrefix}3`) === 'sent', 'Status of half-open successful email should be sent.');

    // Directly use console.log and console.error in the catch block
    console.log(`\n--- Test Summary: ${testCount} tests, ${failedTests} failed ---`);
    if (failedTests > 0) {
        process.exit(1); // Exit with error code if tests failed
    } else {
        process.exit(0); // Exit with success code if all tests passed
    }
}

// Directly use console.error in the catch block
runTests().catch(console.error);