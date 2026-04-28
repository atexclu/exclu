export function isDeletedAccountError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as { message?: string }).message ?? '';
  return typeof msg === 'string' && msg.includes('EXCLU_DELETED_ACCOUNT');
}

export function deletedAccountMessage(): string {
  return 'This account has already been deleted. You must use another email address.';
}
