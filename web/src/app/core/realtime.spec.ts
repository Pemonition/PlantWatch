/**
 * Tests for the reconnect backoff.
 *
 * The policy is the difference between a wall display that recovers from a ten-minute API
 * restart and one that is found dead the next morning, so the "never gives up" property is
 * asserted rather than assumed.
 */

import { describe, expect, it } from 'vitest';
import { RetryContext } from '@microsoft/signalr';
import { ForeverBackoffRetryPolicy } from './realtime.service';

function context(previousRetryCount: number): RetryContext {
  return {
    previousRetryCount,
    elapsedMilliseconds: previousRetryCount * 1_000,
    retryReason: new Error('connection lost'),
  };
}

describe('ForeverBackoffRetryPolicy', () => {
  const policy = new ForeverBackoffRetryPolicy(30_000, 1_000);

  it('never returns null, so SignalR never stops retrying', () => {
    for (const attempt of [0, 1, 5, 50, 5_000]) {
      expect(policy.nextRetryDelayInMilliseconds(context(attempt))).toBeTypeOf('number');
    }
  });

  it('backs off exponentially from the base delay', () => {
    // Jitter is up to 500ms, so each attempt is asserted as a range rather than a value.
    expect(policy.nextRetryDelayInMilliseconds(context(0))).toBeGreaterThanOrEqual(1_000);
    expect(policy.nextRetryDelayInMilliseconds(context(0))).toBeLessThan(1_500);

    expect(policy.nextRetryDelayInMilliseconds(context(2))).toBeGreaterThanOrEqual(4_000);
    expect(policy.nextRetryDelayInMilliseconds(context(2))).toBeLessThan(4_500);
  });

  it('caps the delay so a long outage does not back off to hours', () => {
    expect(policy.nextRetryDelayInMilliseconds(context(1_000))).toBeLessThanOrEqual(30_500);
    expect(policy.nextRetryDelayInMilliseconds(context(1_000))).toBeGreaterThanOrEqual(30_000);
  });
});
