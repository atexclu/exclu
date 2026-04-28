import { describe, it, expect } from 'vitest';
import { isDeletedAccountError, deletedAccountMessage } from './deletedAccountErrors';

describe('deletedAccountErrors', () => {
  it('matches errors with EXCLU_DELETED_ACCOUNT marker', () => {
    expect(isDeletedAccountError({ message: 'Database error: EXCLU_DELETED_ACCOUNT: ...' })).toBe(true);
    expect(isDeletedAccountError({ message: 'something else' })).toBe(false);
    expect(isDeletedAccountError(null)).toBe(false);
    expect(isDeletedAccountError(undefined)).toBe(false);
  });

  it('returns the canonical user-facing message', () => {
    expect(deletedAccountMessage()).toBe('This account has already been deleted. You must use another email address.');
  });
});
