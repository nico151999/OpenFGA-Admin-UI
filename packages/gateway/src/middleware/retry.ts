import { logger } from '../utils/logger';

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  retryableStatuses: [429, 409, 503, 502, 504],
};

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoff(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.initialDelayMs * 2 ** attempt;
  const jitter = Math.random() * 0.3 * exponentialDelay; // 30% jitter
  return Math.min(exponentialDelay + jitter, config.maxDelayMs);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry middleware for handling transient errors
 * This wraps fetch calls to OpenFGA with retry logic
 */
export async function withRetry(
  fn: () => Promise<Response>,
  config: Partial<RetryConfig> = {},
  requestId?: string
): Promise<Response> {
  const retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;
  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      const response = await fn();

      if (retryConfig.retryableStatuses.includes(response.status)) {
        lastResponse = response;

        if (attempt < retryConfig.maxRetries) {
          const delay = calculateBackoff(attempt, retryConfig);

          // Check for Retry-After header
          const retryAfter = response.headers.get('Retry-After');
          const actualDelay = retryAfter
            ? Math.min(parseInt(retryAfter, 10) * 1000, retryConfig.maxDelayMs)
            : delay;

          logger.warn(
            {
              requestId,
              status: response.status,
              attempt: attempt + 1,
              maxRetries: retryConfig.maxRetries,
              delayMs: actualDelay,
            },
            `Retryable status received, retrying after ${actualDelay}ms`
          );

          await sleep(actualDelay);
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error as Error;

      if (attempt < retryConfig.maxRetries) {
        const delay = calculateBackoff(attempt, retryConfig);

        logger.warn(
          {
            requestId,
            error: lastError.message,
            attempt: attempt + 1,
            maxRetries: retryConfig.maxRetries,
            delayMs: delay,
          },
          `Request failed, retrying after ${delay}ms`
        );

        await sleep(delay);
      }
    }
  }

  // If we have a response, return it (even if it's an error status)
  if (lastResponse) {
    logger.error(
      {
        requestId,
        status: lastResponse.status,
        attempts: retryConfig.maxRetries + 1,
      },
      'Max retries exceeded'
    );
    return lastResponse;
  }

  // If we only have an error, throw it
  throw lastError || new Error('Request failed after retries');
}
