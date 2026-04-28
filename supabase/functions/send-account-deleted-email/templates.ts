/**
 * Email templates for account deletion flows.
 *
 * Pure functions: take a small set of inputs, return `{ subject, html }`.
 * No I/O, no side effects. Easy to test in isolation.
 *
 * Used by:
 *   - send-account-deleted-email/index.ts  → confirmation + support alert
 *   - notify-fans-creator-deleted/index.ts → per-fan creator-deleted notification
 */

import { escapeHtml } from '../_shared/brevo.ts';

export const ACCOUNT_DELETED_CONFIRMATION = ({ accountType }: { accountType: string }) => ({
  subject: 'Your Exclu account has been deleted',
  html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.5;">
    <h2 style="margin: 0 0 16px; font-size: 22px;">Your Exclu account has been deleted</h2>
    <p>Your account has been permanently deleted from Exclu. You will no longer be able to log in.</p>
    <p><strong>What happens next:</strong></p>
    <ul style="padding-left: 20px;">
      <li>Your profile is hidden from all surfaces immediately.</li>
      <li>Your handle is permanently reserved and cannot be reused.</li>
      <li>You cannot create a new account with the same email address.</li>
      <li>Active subscriptions (if any) have been canceled with no refunds for the current period.</li>
    </ul>
    <p><strong>Data retention:</strong> Per French accounting law, your transactional data (invoices, sales, payouts) is retained for 10 years. Personal data (display name, bio, avatar, conversations) is hidden everywhere on Exclu immediately.</p>
    <p>If this was a mistake or you have questions, contact <a href="mailto:atexclu@gmail.com" style="color:#7c3aed;">atexclu@gmail.com</a>.</p>
    <p style="margin-top: 24px;">Thanks for being part of Exclu.</p>
    <p style="font-size: 12px; color: #777; margin-top: 8px;">Account type on file: ${escapeHtml(accountType)}</p>
  </div>`,
});

export const FAN_CREATOR_DELETED = ({
  creatorHandle,
  periodEnd,
}: {
  creatorHandle: string;
  periodEnd: string;
}) => ({
  subject: `Creator @${escapeHtml(creatorHandle)} has left Exclu`,
  html: `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.5;">
    <h2 style="margin: 0 0 16px; font-size: 22px;">Creator @${escapeHtml(creatorHandle)} has left Exclu</h2>
    <p>The creator <strong>@${escapeHtml(creatorHandle)}</strong> you were subscribed to has deleted their Exclu account.</p>
    <p><strong>Your subscription has been canceled and will not renew.</strong></p>
    <p>You retain access to their content until <strong>${escapeHtml(periodEnd)}</strong>. After that date, you will no longer have access. No further charges will be made.</p>
    <p>Want to support other creators? <a href="https://exclu.at/directory/creators" style="color:#7c3aed;">Discover more on Exclu</a>.</p>
  </div>`,
});

export const ACCOUNT_DELETION_SUPPORT_ALERT = ({
  userId,
  error,
}: {
  userId: string;
  error: string;
}) => ({
  subject: '[ACTION REQUIRED] Account deletion partial failure',
  html: `<div style="font-family: monospace; max-width: 800px; padding: 24px; color: #1a1a1a;">
    <h2>Account deletion: auth ban failed</h2>
    <p>The DB-side soft-delete completed for <code>user_id = ${escapeHtml(userId)}</code>, but applying the auth ban failed after 3 retries.</p>
    <p><strong>Error:</strong> <code>${escapeHtml(error)}</code></p>
    <p><strong>Manual remediation:</strong></p>
    <ol>
      <li>Open the Supabase dashboard &rarr; Authentication &rarr; Users.</li>
      <li>Find the user by <code>user_id</code>.</li>
      <li>Set Ban Duration to "100 years" and reset password to a random string.</li>
    </ol>
    <p>The user is already invisible in the app (DB shows deleted_at set) but can still technically log in until ban is applied.</p>
  </div>`,
});
