# Resilient Email Service

This project implements a robust and resilient Email Service designed to reliably send emails using multiple providers, incorporating common design patterns such as Retry, Fallback, Idempotency, Rate Limiting, and Circuit Breaking.

## Project Structure

The project is organized into the following directories:


* `EmailService.js`: The main class implementing the email sending logic and resilience patterns.
* `providers.js`: Mock email provider functions to simulate external email sending APIs.
* `utils.js`: Utility functions like `sleep` and `retryWithBackoff`.

* `EmailService.test.js`: Comprehensive test suite for the `EmailService`.
* `index.js`: A simple demonstration script to showcase the Email Service in action.

## Features Implemented

The `EmailService` incorporates the following resilience patterns:

1.  **Retry Mechanism**: Failed email sending attempts are automatically retried with an exponential backoff strategy to handle transient failures.
2.  **Fallback Mechanism**: If the primary email provider fails persistently, the service automatically attempts to send the email via alternative providers.
3.  **Idempotency**: Ensures that duplicate email sending requests (identified by a unique `emailId`) within a configurable window are processed only once, preventing redundant emails.
4.  **Rate Limiting**: Controls the number of requests sent to email providers within a specific time window, preventing API abuse and throttling. Excess requests are queued and processed when capacity allows.
5.  **Circuit Breaker**: Protects the system from repeatedly calling failing email providers. If a provider experiences a configurable number of consecutive failures, its "circuit" opens, temporarily blocking further requests to it. After a timeout, it enters a "half-open" state, allowing a single test request to determine if the provider has recovered.

## Setup and Installation

To get this project up and running on your local machine, follow these steps:

### Prerequisites

* **Node.js**
* **npm** (Node Package Manager)

### Next step

  **Clone the repository** (or download the project files)


## How to Run

### 1. Run the Demonstration

The `index.js` file provides a quick demonstration of the Email Service and its features in action, logging its behavior to the console.

run this command - node index.js
You will see log messages indicating emails being sent, retried, falling back, being rate-limited and queued, and circuit breaker states changing.

### 2. Run the Unit Tests
The EmailService.test.js file contains a comprehensive suite of unit tests that verify the correctness of each implemented resilience pattern.
run this command node - EmailService.test.js
The output will show PASS or FAIL for each test case, providing clear feedback on the service's functionality.