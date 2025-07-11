// index.js

const EmailService = require('C:\\resilient-email-service\\EmailService');
const { mockProvider1, mockProvider2 } = require('C:\\resilient-email-service\\providers');
const { sleep } = require('C:\\resilient-email-service\\utils');

// Define a simple logger for the demonstration
const demoLogger = {
    log: (...args) => console.log('[Demo Log]', ...args),
    error: (...args) => console.error('[Demo ERROR]', ...args)
};

async function runDemonstration() {
    demoLogger.log('--- Starting Email Service Quick Demonstration ---');

    // --- Testing Basic Send and Fallback ---
    demoLogger.log('\n--- Testing Basic Send and Fallback ---');
    const service = new EmailService([
        (to, subject, body) => mockProvider1(to, subject, body, 0.5), // 50% success
        (to, subject, body) => mockProvider2(to, subject, body, 1.0)  // 100% success
    ], {
        maxRetries: 1,
        initialRetryDelay: 50,
        logger: demoLogger // Explicitly pass the demoLogger
    });

    try {
        const emailId = `quick-email-${Date.now()}-1`;
        demoLogger.log(`Sending email ${emailId}...`);
        const result = await service.sendEmail({
            emailId,
            to: 'demo@example.com',
            subject: 'Quick Demo Email',
            body: 'This is a test email.'
        });
        demoLogger.log(`Email ${emailId} sent successfully: ${result}`);
        demoLogger.log(`Status of ${emailId}: ${service.getEmailStatus(emailId)}`);
    } catch (error) {
        demoLogger.error(`Failed to send email 1: ${error.message}`);
        // The original emailId might be dynamic, so let's try to get status based on the actual ID
        demoLogger.log(`Status of quick-email-${Date.now()}-1 (might be incorrect due to error): ${service.getEmailStatus(emailId)}`);
    }

    // --- Testing Idempotency ---
    demoLogger.log('\n--- Testing Idempotency ---');
    const idempotentId = `quick-idempotent-${Date.now()}`;
    try {
        demoLogger.log(`Sending idempotent email ${idempotentId} (first attempt)...`);
        await service.sendEmail({
            emailId: idempotentId,
            to: 'idempotent@example.com',
            subject: 'Idempotency Test',
            body: 'First email for idempotency.'
        });
        demoLogger.log(`First send of ${idempotentId} successful.`);

        demoLogger.log(`Sending idempotent email ${idempotentId} (second attempt)...`);
        const result = await service.sendEmail({
            emailId: idempotentId,
            to: 'idempotent@example.com',
            subject: 'Idempotency Test',
            body: 'Second email for idempotency.'
        });
        demoLogger.log(`Second send of ${idempotentId} result: ${result}`);
        demoLogger.log(`Status of ${idempotentId}: ${service.getEmailStatus(idempotentId)}`);
    } catch (error) {
        demoLogger.error(`Failed on idempotency test: ${error.message}`);
    }

    // --- Testing Rate Limiting and Queueing ---
    demoLogger.log('\n--- Testing Rate Limiting and Queueing ---');
    const rateLimitService = new EmailService([
        (to, subject, body) => mockProvider1(to, subject, body, 1.0)
    ], {
        rateLimitWindowMs: 500, // Short window
        maxRequestsPerWindow: 1, // Allow only 1 request per window
        initialRetryDelay: 10,
        logger: demoLogger // Explicitly pass the demoLogger
    });

    const rateLimitPromises = [];
    const timestamp = Date.now();
    for (let i = 0; i < 4; i++) {
        const emailId = `quick-ratelimit-${timestamp}-${i}`;
        demoLogger.log(`Queuing email ${emailId} for rate limit test.`);
        rateLimitPromises.push(
            rateLimitService.sendEmail({
                emailId,
                to: `rl${i}@example.com`,
                subject: `Rate Limit Test ${i}`,
                body: `Body ${i}`
            }).then(result => {
                demoLogger.log(`[Rate Limit Test] Sent ${emailId}: ${result}`);
                demoLogger.log(`Status of ${emailId}: ${rateLimitService.getEmailStatus(emailId)}`);
            }).catch(e => {
                demoLogger.error(`[Rate Limit Test] Failed to send ${emailId}: ${e.message}`);
                demoLogger.log(`Status of ${emailId}: ${rateLimitService.getEmailStatus(emailId)}`);
            })
        );
        await sleep(50); // Small delay to help hit the rate limit
    }
    await Promise.allSettled(rateLimitPromises); // Use allSettled to see all outcomes
    demoLogger.log('Finished rate limiting test.');
    await sleep(600); // Give time for queued emails to process if any
    demoLogger.log('Statuses after rate limit test and wait:');
    for (let i = 0; i < 4; i++) {
        const emailId = `quick-ratelimit-${timestamp}-${i}`;
        demoLogger.log(`Status of ${emailId}: ${rateLimitService.getEmailStatus(emailId)}`);
    }


    // --- Testing Circuit Breaker Activation (Provider 1 fails) ---
    demoLogger.log('\n--- Testing Circuit Breaker Activation (Provider 1 fails) ---');
    // Store the provider function in a variable to ensure we use the same reference
    const cbMockProvider1 = (to, subject, body) => mockProvider1(to, subject, body, 0.0); // Provider 1 always fails
    const cbMockProvider2 = (to, subject, body) => mockProvider2(to, subject, body, 1.0);  // Provider 2 always succeeds

    const circuitBreakerService = new EmailService([
        cbMockProvider1, // Use the stored reference
        cbMockProvider2
    ], {
        maxRetries: 0, // Fail fast
        circuitBreakerThreshold: 2, // Open after 2 failures
        circuitBreakerTimeoutMs: 100, // Short timeout
        logger: demoLogger // Explicitly pass the demoLogger
    });

    const cbTimestamp = Date.now();

    // Cause P1 to fail and open circuit
    try {
        const emailId = `quick-cb-1-${cbTimestamp}`;
        demoLogger.log(`Sending email ${emailId} (expect P1 fail, P2 success)...`);
        const result = await circuitBreakerService.sendEmail({ emailId, to: 'cb@example.com', subject: 'Circuit Breaker Test 1', body: 'Testing P1 fail.' });
        demoLogger.log(`Sent ${emailId}: ${result}`);
    } catch (error) {
        demoLogger.error(`Failed to send ${`quick-cb-1-${cbTimestamp}`}: ${error.message}`);
    }
    demoLogger.log(`Status of ${`quick-cb-1-${cbTimestamp}`}: ${circuitBreakerService.getEmailStatus(`quick-cb-1-${cbTimestamp}`)}`);


    try {
        const emailId = `quick-cb-2-${cbTimestamp}`;
        demoLogger.log(`Sending email ${emailId} (expect P1 fail, P2 success)...`);
        const result = await circuitBreakerService.sendEmail({ emailId, to: 'cb@example.com', subject: 'Circuit Breaker Test 2', body: 'Testing P1 fail.' });
        demoLogger.log(`Sent ${emailId}: ${result}`);
    } catch (error) {
        demoLogger.error(`Failed to send ${`quick-cb-2-${cbTimestamp}`}: ${error.message}`);
    }
    demoLogger.log(`Status of ${`quick-cb-2-${cbTimestamp}`}: ${circuitBreakerService.getEmailStatus(`quick-cb-2-${cbTimestamp}`)}`);

    // At this point, P1's circuit should be open. Subsequent requests should bypass P1.
    await sleep(50); // Give a tiny moment for CB state to settle if async
    // Use the stored reference `cbMockProvider1` to get the circuit state
    demoLogger.log('Checking circuit state for Provider 1 (should be open):', circuitBreakerService.circuitBreakers.get(cbMockProvider1).isOpen);

    try {
        const emailId = `quick-cb-3-${cbTimestamp}`;
        demoLogger.log(`Sending email ${emailId} (expect P1 bypassed, P2 success)...`);
        const result = await circuitBreakerService.sendEmail({ emailId, to: 'cb@example.com', subject: 'Circuit Breaker Test 3', body: 'Testing P1 bypassed.' });
        demoLogger.log(`Sent ${emailId}: ${result}`);
    } catch (error) {
        demoLogger.error(`Failed to send ${`quick-cb-3-${cbTimestamp}`}: ${error.message}`);
    }
    demoLogger.log(`Status of ${`quick-cb-3-${cbTimestamp}`}: ${circuitBreakerService.getEmailStatus(`quick-cb-3-${cbTimestamp}`)}`);


    demoLogger.log('\n--- Email Service Quick Demonstration Finished ---');
}

runDemonstration().catch(error => {
    demoLogger.error('An unexpected error occurred during demonstration:', error.message);
});