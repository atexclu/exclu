import { describe, expect, it } from 'vitest';
import { canAccessPurchasedLink, canAccessCustomRequestDelivery } from './contentAccess';

describe('canAccessPurchasedLink', () => {
  it('blocks pending', () => expect(canAccessPurchasedLink({ status: 'pending' })).toBe(false));
  it('blocks refunded', () => expect(canAccessPurchasedLink({ status: 'refunded' })).toBe(false));
  it('blocks failed', () => expect(canAccessPurchasedLink({ status: 'failed' })).toBe(false));
  it('blocks null', () => expect(canAccessPurchasedLink(null)).toBe(false));
  it('allows succeeded', () => expect(canAccessPurchasedLink({ status: 'succeeded' })).toBe(true));
});

describe('canAccessCustomRequestDelivery', () => {
  it('blocks accepted but not captured', () =>
    expect(canAccessCustomRequestDelivery({ status: 'accepted', captured_at: null })).toBe(false));
  it('blocks delivered without capture', () =>
    expect(canAccessCustomRequestDelivery({ status: 'delivered', captured_at: null })).toBe(false));
  it('allows delivered + captured', () =>
    expect(canAccessCustomRequestDelivery({ status: 'delivered', captured_at: '2026-04-21T00:00:00Z' })).toBe(true));
  it('blocks refunded', () =>
    expect(canAccessCustomRequestDelivery({ status: 'refunded', captured_at: '2026-04-21T00:00:00Z' })).toBe(false));
});
