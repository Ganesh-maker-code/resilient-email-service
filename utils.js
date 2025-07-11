//utils.js

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const retryWithBackoff = async (fn, maxRetries, delay, emailId, logger) => {
    let attempt = 0;
    let currentDelay = delay;
    let lastError = null;

    while (attempt <= maxRetries) {
        try {
            
            logger.log(`Attempt ${attempt + 1} for email ${emailId}`);
            const result = await fn();
            return result;
        } catch (error) {
            lastError = error;
            
            logger.error(`Attempt ${attempt + 1} for email ${emailId} failed: ${error.message}`);
            attempt++;
            if (attempt <= maxRetries) {
                currentDelay *= 2; // Exponential backoff
                logger.log(`Retrying ${emailId}, attempt ${attempt + 1}/${maxRetries + 1} after ${currentDelay}ms`);
                await sleep(currentDelay);
            }
        }
    }
    
    const errorMessage = `Failed after ${maxRetries + 1} attempts for email ${emailId}. Last error: ${lastError ? lastError.message : 'Unknown error'}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
};

module.exports = { sleep, retryWithBackoff };