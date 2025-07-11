
/**
 * Mock Email Provider 1.
 * Simulates sending an email with a configurable success rate.
 * @param {string} to - Recipient email.
 * @param {string} subject - Email subject.
 * @param {string} body - Email body.
 * @param {number} [successRate=0.7] - Probability of success (0.0 to 1.0).
 * @returns {Promise<string>} A Promise that resolves with a success message or rejects with an error.
 */
const mockProvider1 = (to, subject, body, successRate = 0.7) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (Math.random() < successRate) {
                resolve(`Email sent successfully via Provider 1 to ${to}`);
            } else {
                reject(new Error(`Failed to send email via Provider 1 to ${to}`));
            }
        }, 100); // Simulate network latency
    });
};

/**
 * Mock Email Provider 2.
 * Simulates sending an email with a configurable success rate.
 * @param {string} to - Recipient email.
 * @param {string} subject - Email subject.
 * @param {string} body - Email body.
 * @param {number} [successRate=0.9] - Probability of success (0.0 to 1.0).
 * @returns {Promise<string>} A Promise that resolves with a success message or rejects with an error.
 */
const mockProvider2 = (to, subject, body, successRate = 0.9) => {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            if (Math.random() < successRate) {
                resolve(`Email sent successfully via Provider 2 to ${to}`);
            } else {
                reject(new Error(`Failed to send email via Provider 2 to ${to}`));
            }
        }, 150); // Simulate network latency
    });
};

module.exports = {
    mockProvider1,
    mockProvider2
};