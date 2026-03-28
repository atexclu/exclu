import { useEffect, useRef } from 'react';

interface QuickPayFormProps {
  /** Key-value pairs for the hidden form fields */
  fields: Record<string, string>;
  /** If true, submit automatically on mount (default: true) */
  autoSubmit?: boolean;
  /** If true, open in a new window instead of navigating current page (for chat modals) */
  openInNewWindow?: boolean;
}

/**
 * Invisible form that POSTs to QuickPay hosted payment page.
 *
 * Usage:
 *   1. Edge function returns { fields: { QuickPayToken, SiteID, AmountTotal, ... } }
 *   2. Render <QuickPayForm fields={data.fields} /> to redirect to payment page
 *   3. For chat (window.open pattern), pass openInNewWindow={true}
 */
export function QuickPayForm({ fields, autoSubmit = true, openInNewWindow = false }: QuickPayFormProps) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!autoSubmit || !formRef.current) return;

    if (openInNewWindow) {
      submitInNewWindow(fields);
    } else {
      formRef.current.submit();
    }
  }, [autoSubmit, openInNewWindow, fields]);

  // For the standard case (redirect current page), render a hidden form
  if (openInNewWindow) return null;

  return (
    <form
      ref={formRef}
      method="POST"
      action="https://quickpay.ugpayments.ch/"
      style={{ display: 'none' }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </form>
  );
}

/**
 * Submit a QuickPay form in a new browser window.
 * Used by chat modals to avoid navigating away from the conversation.
 */
export function submitInNewWindow(fields: Record<string, string>): void {
  const win = window.open('about:blank', '_blank');
  if (!win) {
    // Popup blocked — fall back to current window redirect
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://quickpay.ugpayments.ch/';
    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
    return;
  }

  const doc = win.document;
  doc.open();
  doc.write('<!DOCTYPE html><html><body>');
  doc.write('<form id="qp" method="POST" action="https://quickpay.ugpayments.ch/">');
  Object.entries(fields).forEach(([name, value]) => {
    doc.write(`<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`);
  });
  doc.write('</form>');
  doc.write('<script>document.getElementById("qp").submit();</script>');
  doc.write('</body></html>');
  doc.close();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
