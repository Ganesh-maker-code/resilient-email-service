//EmailService.js

const { retryWithBackoff, sleep } = require('C:\\resilient-email-service\\utils');

/**
 * @typedef {'pending' | 'sent' | 'failed' | 'processing'} EmailStatus
 */

/**
 * Represents a circuit breaker state.
 * @typedef {Object} CircuitState
 * @property {boolean} isOpen - True if the circuit is open (failing).
 * @property {number} lastFailureTime - Timestamp of the last failure.
 * @property {number} failureCount - Consecutive failure count.
 * @property {number} halfOpenAttempts - Attempts made in half-open state.
 */

class EmailService {
    /**
     * @param {Array<Function>} providers - An array of email provider functions.
     * @param {Object} options - Configuration options for the service.
     * @param {number} [options.maxRetries=3] - Max retries for each provider attempt.
     * @param {number} [options.initialRetryDelay=100] - Initial delay for exponential backoff.
     * @param {number} [options.idempotencyWindowMs=60000] - Time window for idempotency (1 minute).
     * @param {number} [options.rateLimitWindowMs=1000] - Time window for rate limiting (1 second).
     * @param {number} [options.maxRequestsPerWindow=10] - Max requests allowed in the rate limit window.
     * @param {number} [options.circuitBreakerThreshold=3] - Consecutive failures to open circuit.
     * @param {number} [options.circuitBreakerTimeoutMs=5000] - Time circuit stays open.
     * @param {number} [options.circuitBreakerHalfOpenAttempts=1] - Attempts made in half-open state.
     * @param {Function} [options.logger=console.log] - Logging function.
     */
    constructor(providers, options = {}) {
        if (!Array.isArray(providers) || providers.length === 0) {
            throw new Error('At least one email provider is required.');
        }

        this.providers = providers;
        this.currentProviderIndex = 0;
        this.maxRetries = options.maxRetries || 3;
        this.initialRetryDelay = options.initialRetryDelay || 100;

        // Idempotency
        /** @type {Set<string>} */
        this.sentEmailIds = new Set();
        this.idempotencyWindowMs = options.idempotencyWindowMs || 60 * 1000; // 1 minute
        // For a quick demo, we explicitly *do not* call setInterval here.
        // In a long-running service, you would manage this cleanup,
        

        // Rate Limiting
        /** @type {Array<number>} */
        this.requestTimestamps = [];
        this.rateLimitWindowMs = options.rateLimitWindowMs || 1000; // 1 second
        this.maxRequestsPerWindow = options.maxRequestsPerWindow || 10;

        // Status Tracking
        /** @type {Map<string, EmailStatus>} */
        this.emailStatuses = new Map();
        /** @type {Array<Object>} */
        this.emailQueue = []; // Basic queue
        this.isProcessingQueue = false;

        // Circuit Breaker
        /** @type {Map<Function, CircuitState>} */
        this.circuitBreakers = new Map(providers.map(p => [p, {
            isOpen: false,
            lastFailureTime: 0,
            failureCount: 0,
            halfOpenAttempts: 0
        }]));
        this.circuitBreakerThreshold = options.circuitBreakerThreshold || 3;
        this.circuitBreakerTimeoutMs = options.circuitBreakerTimeoutMs || 5000; // 5 seconds
        this.circuitBreakerHalfOpenAttempts = options.circuitBreakerHalfOpenAttempts || 1;

        // Logging: Ensure this.logger is always an object with log and error methods
        this.logger = options.logger || {
            log: console.log.bind(console), // Bind to console to preserve 'this' context
            error: console.error.bind(console) // Bind to console to preserve 'this' context
        };
    }

    /**
     * Cleans up old email IDs from the idempotency set.
     * In a production system, this would be crucial. For a short demo,
     * it can be called manually or relies on the demo's short lifespan.
     * @private
     */
    _cleanupIdempotencySet() {
        // Keeping the function, but it's not called by setInterval in the constructor anymore.
        // If you need it, call it explicitly like `emailService._cleanupIdempotencySet();`
        this.logger.log('Cleaning up idempotency set (clearing all IDs)...'); // Use .log here
        this.sentEmailIds.clear();
    }

    /**
     * Checks if the circuit for a given provider is open and needs to block requests.
     * Manages circuit breaker state transitions (closed, open, half-open).
     * @param {Function} provider - The email provider function.
     * @returns {boolean} True if the circuit is open and requests should be blocked.
     * @private
     */
    _isCircuitOpen(provider) {
        const state = this.circuitBreakers.get(provider);
        if (!state) return false;

        if (state.isOpen) {
            const now = Date.now();
            // If timeout passed, move to half-open state
            if (now - state.lastFailureTime > this.circuitBreakerTimeoutMs) {
                this.logger.log(`Circuit for provider ${provider.name || 'unknown'} is half-open.`);
                state.isOpen = false;
                state.halfOpenAttempts = 0;
                return false; // Allow one request to try and close the circuit
            }
            this.logger.log(`Circuit for provider ${provider.name || 'unknown'} is open. Blocking request.`);
            return true; // Circuit is open, block the request
        }
        return false;
    }

    /**
     * Increments failure count for a provider and opens the circuit if threshold is met.
     * @param {Function} provider - The email provider function that failed.
     * @private
     */
    _recordFailure(provider) {
        const state = this.circuitBreakers.get(provider);
        if (!state) return;

        state.failureCount++;
        state.lastFailureTime = Date.now();

        if (!state.isOpen && state.failureCount >= this.circuitBreakerThreshold) {
            state.isOpen = true;
            this.logger.log(`Circuit for provider ${provider.name || 'unknown'} opened due to ${state.failureCount} consecutive failures.`);
        }
    }

    /**
     * Resets the circuit breaker for a successful provider.
     * @param {Function} provider - The email provider function that succeeded.
     * @private
     */
    _recordSuccess(provider) {
        const state = this.circuitBreakers.get(provider);
        if (!state) return;

        // If circuit was half-open and success occurred, close it.
        // If it was closed, reset failure count.
        if (state.isOpen) { // Means it was half-open
            this.logger.log(`Circuit for provider ${provider.name || 'unknown'} closed after successful half-open attempt.`);
        }
        state.isOpen = false;
        state.failureCount = 0;
        state.halfOpenAttempts = 0;
    }

    /**
     * Checks if a new request can be made based on rate limiting rules.
     * @returns {boolean} True if the request is allowed, false otherwise.
     * @private
     */
    _isRateLimited() {
        const now = Date.now();
        // Remove timestamps outside the current window
        this.requestTimestamps = this.requestTimestamps.filter(timestamp =>
            now - timestamp < this.rateLimitWindowMs
        );

        if (this.requestTimestamps.length >= this.maxRequestsPerWindow) {
            this.logger.log('Rate limited: Too many requests.');
            return true;
        }
        this.requestTimestamps.push(now);
        return false;
    }

    /**
     * Adds an email sending task to the queue.
     * @param {Object} emailData - The email data.
     * @param {string} emailData.emailId - Unique ID for the email.
     * @param {string} emailData.to - Recipient email.
     * @param {string} emailData.subject - Email subject.
     * @param {string} emailData.body - Email body.
     * @returns {Promise<string>} A Promise that resolves with the emailId or rejects if already queued/sent.
     */
    async sendEmail(emailData) {
        const { emailId, to, subject, body } = emailData;

        if (!emailId || !to || !subject || !body) {
            throw new Error('Email data must include emailId, to, subject, and body.');
        }

        // Idempotency check
        if (this.sentEmailIds.has(emailId)) {
            this.logger.log(`Email with ID ${emailId} already processed (idempotency).`);
            return `Email with ID ${emailId} was already sent. Current status: ${this.emailStatuses.get(emailId) || 'unknown'}`;
        }

        if (this._isRateLimited()) {
            this.logger.log(`Email with ID ${emailId} is rate-limited. Queuing...`);
            return new Promise((resolve, reject) => {
                this.emailQueue.push({ emailData, resolve, reject });
                this._processQueue(); // Try to process the queue immediately
            });
        }

        // Add to idempotency set and set status to processing
        this.sentEmailIds.add(emailId);
        this.emailStatuses.set(emailId, 'processing');
        this.logger.log(`Email ${emailId} added to processing.`);

        return this._processSend(emailData);
    }

    /**
     * Processes an email sending task directly (used by sendEmail and queue).
     * @param {Object} emailData - The email data.
     * @returns {Promise<string>} A Promise that resolves with a success message or rejects with an error.
     * @private
     */
    async _processSend(emailData) {
        const { emailId, to, subject, body } = emailData;

        let lastError = null; // MOVED DECLARATION HERE for wider scope

        try {
            // Iterate through providers for fallback
            for (let i = 0; i < this.providers.length; i++) {
                const providerIndex = (this.currentProviderIndex + i) % this.providers.length;
                const provider = this.providers[providerIndex];

                if (this._isCircuitOpen(provider)) {
                    this.logger.log(`Skipping provider ${provider.name || 'unknown'} for email ${emailId} because circuit is open.`);
                    lastError = new Error(`Circuit open for ${provider.name || 'unknown'}`);
                    continue; // Try next provider if current is open
                }

                try {
                    const result = await retryWithBackoff(
                        () => provider(to, subject, body),
                        this.maxRetries,
                        this.initialRetryDelay,
                        emailId,
                        this.logger // Pass the logger object here
                    );
                    this._recordSuccess(provider); // Record success for circuit breaker
                    this.emailStatuses.set(emailId, 'sent');
                    this.currentProviderIndex = providerIndex; // Stick with successful provider for next attempt
                    this.logger.log(`Email ${emailId} successfully sent via provider ${provider.name || 'unknown'}.`);
                    return result; // Email sent successfully, return result
                } catch (error) {
                    lastError = error;
                    this.logger.log(`Provider ${provider.name || 'unknown'} failed for email ${emailId}. Trying next provider...`);
                    this.logger.error(`Error for ${emailId} with provider ${provider.name || 'unknown'}: ${error.message}`); // Use .error here
                    this._recordFailure(provider); // Record failure for circuit breaker
                }
            }

            // If all providers failed
            this.emailStatuses.set(emailId, 'failed');
            const errorMessage = `All providers failed for email ${emailId}. Last error: ${lastError ? lastError.message : 'Unknown error.'}`;
            this.logger.error(errorMessage); // Use .error here
            throw new Error(errorMessage);

        } catch (error) {
            this.emailStatuses.set(emailId, 'failed');
            // If an error occurs that wasn't caught by the provider loop, log it.
            // lastError is now accessible here.
            if (lastError === null || lastError.message !== error.message) { // Check if it's a new, unhandled error
                this.logger.error(`Unhandled error during email ${emailId} processing: ${error.message}`);
            }
            throw error; // Re-throw the error for the caller to handle
        } finally {
            // This is important: ensure the queue continues processing if possible
            this._processQueue();
        }
    }

    /**
     * Processes items from the email queue.
     * @private
     */
    async _processQueue() {
        if (this.isProcessingQueue || this.emailQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;
        while (this.emailQueue.length > 0) {
            if (this._isRateLimited()) {
                this.logger.log('Rate limited: Stopping queue processing temporarily.');
                break;
            }

            const { emailData, resolve, reject } = this.emailQueue.shift();
            try {
                const result = await this._processSend(emailData);
                resolve(result);
            } catch (error) {
                reject(error);
            }
        }
        this.isProcessingQueue = false;
        // If there are still items in the queue and we stopped due to rate limiting,
        // try to process again after a short delay (e.g., next rate limit window)
        if (this.emailQueue.length > 0) {
            this.logger.log('Queue still has items after rate limit hit. Retrying processing after delay...');
            setTimeout(() => this._processQueue(), this.rateLimitWindowMs + 10); // +10ms to ensure window resets
        }
    }

    /**
     * Get the current status of an email.
     * @param {string} emailId - The unique ID of the email.
     * @returns {EmailStatus | undefined} The status of the email, or undefined if not tracked.
     */
    getEmailStatus(emailId) {
        return this.emailStatuses.get(emailId);
    }
}

module.exports = EmailService;