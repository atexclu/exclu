import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');
const siteUrl = Deno.env.get('PUBLIC_SITE_URL');

// Optional Brevo configuration for sending content access emails to buyers
const brevoApiKey = Deno.env.get('BREVO_API_KEY');
const brevoSenderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
const brevoSenderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Exclu';

if (!stripeSecretKey) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

if (!stripeWebhookSecret) {
  throw new Error('Missing STRIPE_WEBHOOK_SECRET environment variable');
}

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Missing PROJECT_URL or SERVICE_ROLE_KEY environment variables');
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: '2023-10-16',
});

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function sendContentAccessEmail(toEmail: string, linkTitle: string, accessUrl: string): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing); skipping email send');
    return false;
  }

  const subject = `Your access to "${linkTitle}" on Exclu`;
  const htmlContent = `
    <html>
      <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #050816; color: #f9fafb; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #020617; border-radius: 16px; padding: 24px; border: 1px solid #1f2937;">
          <h1 style="font-size: 20px; margin: 0 0 12px 0;">Your exclusive content is unlocked 🎉</h1>
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
            Thank you for your purchase. You can access your content here:
          </p>
          <p style="margin: 0 0 20px 0;">
            <a href="${accessUrl}" style="display: inline-block; padding: 10px 18px; background-color: #f97316; color: #0b1120; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 600;">Open my content</a>
          </p>
          <p style="font-size: 12px; line-height: 1.6; color: #9ca3af; margin: 0 0 4px 0;">
            Link: <a href="${accessUrl}" style="color: #f97316; text-decoration: underline;">${accessUrl}</a>
          </p>
          <p style="font-size: 12px; line-height: 1.6; color: #6b7280; margin: 12px 0 0 0;">
            If you didn't request this content, you can safely ignore this email.
          </p>
        </div>
        <p style="font-size: 11px; color: #4b5563; margin-top: 16px; text-align: center;">
          Sent by Exclu · Please do not reply directly to this automated email.
        </p>
      </body>
    </html>
  `;

  const payload = JSON.stringify({
    sender: { email: brevoSenderEmail, name: brevoSenderName },
    to: [{ email: toEmail }],
    subject,
    htmlContent,
  });

  const MAX_ATTEMPTS = 2;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': brevoApiKey, 'Content-Type': 'application/json' },
        body: payload,
      });

      if (response.ok) {
        console.log(`Brevo email sent to ${toEmail} (attempt ${attempt})`);
        return true;
      }

      const errorBody = await response.text();
      console.error(`Brevo email failed (attempt ${attempt}/${MAX_ATTEMPTS})`, response.status, errorBody);
    } catch (err) {
      console.error(`Brevo email error (attempt ${attempt}/${MAX_ATTEMPTS})`, err);
    }

    // Wait 2s before retrying
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    // In the Edge runtime (Deno/Web Crypto), Stripe requires the async variant
    // of constructEvent to work with SubtleCryptoProvider.
    event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return new Response('Webhook signature verification failed', { status: 400 });
  }

  console.log('Received Stripe event:', event.type);

  try {
    switch (event.type) {
      // Fan purchased a link
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;

        // Only process one-time payments for link purchases (not subscriptions)
        // Verify payment_status to avoid granting access for unpaid sessions (e.g. delayed payments)
        if (session.mode === 'payment' && session.metadata?.link_id && session.payment_status === 'paid') {
          const linkId = session.metadata.link_id;
          const creatorId = session.metadata.creator_id;
          const amountTotal = session.amount_total ?? 0;
          const slug = session.metadata.slug as string | undefined;

          // Check if purchase already exists (idempotency)
          const { data: existingPurchase } = await supabase
            .from('purchases')
            .select('id')
            .eq('stripe_session_id', session.id)
            .single();

          if (!existingPurchase) {
            // Prefer an explicit buyer email captured before checkout if present in metadata,
            // otherwise fall back to the email on the Stripe Checkout session.
            const buyerEmailFromMetadata = (session.metadata as any)?.buyerEmail as string | undefined;
            const emailFromStripe = session.customer_details?.email ?? null;
            const customerEmail = (buyerEmailFromMetadata || emailFromStripe || null) as string | null;

            const { error: insertError } = await supabase.from('purchases').insert({
              link_id: linkId,
              amount_cents: amountTotal,
              currency: session.currency?.toUpperCase() ?? 'USD',
              stripe_session_id: session.id,
              status: 'succeeded',
              buyer_email: customerEmail,
              access_token: crypto.randomUUID(),
            });

            if (insertError) {
              console.error('Error inserting purchase:', insertError);
            } else {
              console.log('Purchase recorded for link:', linkId);

              // If we have both an email and a site URL, send the buyer a copy of the access link via Brevo.
              if (customerEmail && siteUrl && slug) {
                try {
                  const base = siteUrl.replace(/\/$/, '');
                  const accessUrl = `${base}/l/${encodeURIComponent(slug)}?session_id=${session.id}`;

                  let linkTitle = 'your exclusive content';
                  const { data: linkRecord } = await supabase
                    .from('links')
                    .select('title')
                    .eq('id', linkId)
                    .single();

                  if (linkRecord?.title) {
                    linkTitle = linkRecord.title;
                  }

                  const emailSent = await sendContentAccessEmail(customerEmail, linkTitle, accessUrl);

                  // Update the email_sent flag on the purchase record
                  if (emailSent) {
                    await supabase
                      .from('purchases')
                      .update({ email_sent: true })
                      .eq('stripe_session_id', session.id);
                  }
                } catch (emailErr) {
                  console.error('Error sending content access email:', emailErr);
                }
              }
            }
          }
        }

        // Handle creator subscription checkout completion
        if (session.mode === 'subscription' && session.metadata?.supabase_user_id) {
          const userId = session.metadata.supabase_user_id;

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ is_creator_subscribed: true })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating creator subscription status:', updateError);
          } else {
            console.log('Creator subscription activated for user:', userId);
          }
        }
        break;
      }

      // Creator subscription updated (e.g., renewed, changed)
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          const isActive = ['active', 'trialing'].includes(subscription.status);

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ is_creator_subscribed: isActive })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating subscription status:', updateError);
          } else {
            console.log('Subscription status updated for user:', userId, 'active:', isActive);
          }
        }
        break;
      }

      // Creator subscription cancelled or expired
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (userId) {
          const { error: updateError } = await supabase
            .from('profiles')
            .update({ is_creator_subscribed: false })
            .eq('id', userId);

          if (updateError) {
            console.error('Error deactivating subscription:', updateError);
          } else {
            console.log('Subscription deactivated for user:', userId);
          }
        }
        break;
      }

      // Stripe Connect account updated (onboarding completed, etc.)
      case 'account.updated': {
        const account = event.data.object as Stripe.Account;
        const userId = account.metadata?.supabase_user_id;

        if (userId) {
          let connectStatus = 'pending';

          if (account.charges_enabled && account.payouts_enabled) {
            connectStatus = 'complete';
          } else if (account.requirements?.disabled_reason) {
            connectStatus = 'restricted';
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ stripe_connect_status: connectStatus })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating Connect status:', updateError);
          } else {
            console.log('Connect status updated for user:', userId, 'status:', connectStatus);
          }
        }
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({ error: 'Webhook processing failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
