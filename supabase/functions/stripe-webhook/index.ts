import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
// Optional: separate signing secret for the test-mode webhook endpoint in Stripe Dashboard.
// If set, the webhook will try the live secret first, then fall back to the test secret.
const stripeWebhookSecretTest = Deno.env.get('STRIPE_WEBHOOK_SECRET_TEST');
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

async function sendStripeVerifiedEmail(toEmail: string, displayName: string | null, paymentsUrl: string | null): Promise<boolean> {
  if (!brevoApiKey || !brevoSenderEmail) {
    console.warn('Brevo not configured (BREVO_API_KEY or BREVO_SENDER_EMAIL missing); skipping email send');
    return false;
  }

  const safeName = displayName?.trim() || 'creator';
  const subject = 'Your Stripe account is verified — payouts are ready';
  const ctaUrl = paymentsUrl || 'https://exclu.at';
  const htmlContent = `
    <html>
      <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #050816; color: #f9fafb; padding: 24px;">
        <div style="max-width: 480px; margin: 0 auto; background-color: #020617; border-radius: 16px; padding: 24px; border: 1px solid #1f2937;">
          <h1 style="font-size: 20px; margin: 0 0 12px 0;">Stripe verification complete ✅</h1>
          <p style="font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
            Hi ${safeName}, your Stripe Connect account has been verified and is now active. You can receive payouts from fans.
          </p>
          <p style="margin: 0 0 20px 0;">
            <a href="${ctaUrl}" style="display: inline-block; padding: 10px 18px; background-color: #f97316; color: #0b1120; text-decoration: none; border-radius: 999px; font-size: 14px; font-weight: 600;">Open payout settings</a>
          </p>
          <p style="font-size: 12px; line-height: 1.6; color: #9ca3af; margin: 0;">
            If you didn't request this, you can ignore this email.
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

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return false;
}

serve(async (req: Request) => {
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
    // Try the live secret first; if it fails and a test secret is configured, try that.
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret!);
    } catch (liveErr) {
      if (stripeWebhookSecretTest) {
        event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecretTest);
      } else {
        throw liveErr;
      }
    }
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

              // Post-purchase: Check if this creator (the referred one) reached $1k net revenue
              // within 90 days of signup → if so, credit $100 bonus to the REFERRED creator themselves.
              if (creatorId) {
                try {
                  // 1. Find the referral row for this creator as the referred party, bonus not yet paid
                  const { data: referral, error: refErr } = await supabase
                    .from('referrals')
                    .select('id, referred_id, created_at, bonus_paid_to_referred')
                    .eq('referred_id', creatorId)
                    .eq('bonus_paid_to_referred', false)
                    .maybeSingle();

                  if (!refErr && referral) {
                    const signupDate = new Date(referral.created_at);
                    const now = new Date();
                    const diffDays = (now.getTime() - signupDate.getTime()) / (1000 * 3600 * 24);

                    if (diffDays <= 90) {
                      // 2. Sum all succeeded purchases for this creator's links (including the current one)
                      const { data: allCreatorLinks } = await supabase
                        .from('links')
                        .select('id')
                        .eq('creator_id', creatorId);

                      if (allCreatorLinks && allCreatorLinks.length > 0) {
                        const allLinkIds = allCreatorLinks.map((l: any) => l.id);
                        const { data: allPurchases, error: purError } = await supabase
                          .from('purchases')
                          .select('amount_cents')
                          .in('link_id', allLinkIds)
                          .eq('status', 'succeeded');

                        if (!purError && allPurchases) {
                          // Creator net revenue: strip the 5% fan processing fee
                          const totalCreatorNetRevenue = allPurchases.reduce(
                            (acc: number, p: any) => acc + Math.round((p.amount_cents || 0) / 1.05), 0
                          );

                          // Milestone: $1,000 net = 100,000 cents
                          if (totalCreatorNetRevenue >= 100000) {
                            console.log(`Referred creator ${creatorId} reached $1k net revenue in 90 days — crediting $100 bonus.`);

                            // 3. Mark bonus as paid to prevent double-crediting
                            await supabase
                              .from('referrals')
                              .update({ bonus_paid_to_referred: true })
                              .eq('id', referral.id);

                            // 4. Credit $100 (10,000 cents) to the REFERRED creator's affiliate_earnings_cents
                            const { data: referredProfile } = await supabase
                              .from('profiles')
                              .select('affiliate_earnings_cents')
                              .eq('id', creatorId)
                              .single();

                            if (referredProfile) {
                              await supabase
                                .from('profiles')
                                .update({
                                  affiliate_earnings_cents: (referredProfile.affiliate_earnings_cents || 0) + 10000,
                                })
                                .eq('id', creatorId);
                            }
                          }
                        }
                      }
                    }
                  }
                } catch (err) {
                  console.error('Error processing $100 referral bonus for referred creator:', err);
                }
              }
            }
          }
        }

        // Handle creator subscription checkout completion
        if (session.mode === 'subscription' && session.metadata?.supabase_user_id) {
          const userId = session.metadata.supabase_user_id;

          const { data: existingProfile, error: existingProfileError } = await supabase
            .from('profiles')
            .select('is_creator_subscribed')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileError) {
            console.error('Error loading profile for subscription activation:', existingProfileError);
          }

          const wasSubscribed = existingProfile?.is_creator_subscribed === true;

          const updatePayload: Record<string, unknown> = { is_creator_subscribed: true };
          if (!wasSubscribed) {
            updatePayload.show_join_banner = false;
            updatePayload.show_certification = true;
            updatePayload.show_deeplinks = true;
            updatePayload.show_available_now = true;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating creator subscription status:', updateError);
          } else {
            console.log('Creator subscription activated for user:', userId);
          }

          // Credit 35% referral commission to the referrer on first-time premium activation
          // 35% of $39 = $13.65 = 1365 cents
          if (!wasSubscribed) {
            try {
              const { data: referral, error: refErr } = await supabase
                .from('referrals')
                .select('id, referrer_id, commission_earned_cents')
                .eq('referred_id', userId)
                .maybeSingle();

              if (!refErr && referral?.referrer_id) {
                const commissionCents = Math.round(3900 * 0.35); // $13.65

                // Update commission on the referral row
                await supabase
                  .from('referrals')
                  .update({
                    status: 'converted',
                    commission_earned_cents: (referral.commission_earned_cents || 0) + commissionCents,
                  })
                  .eq('id', referral.id);

                // Credit to referrer's affiliate_earnings_cents
                const { data: referrerProfile } = await supabase
                  .from('profiles')
                  .select('affiliate_earnings_cents')
                  .eq('id', referral.referrer_id)
                  .single();

                if (referrerProfile) {
                  await supabase
                    .from('profiles')
                    .update({
                      affiliate_earnings_cents: (referrerProfile.affiliate_earnings_cents || 0) + commissionCents,
                    })
                    .eq('id', referral.referrer_id);
                  console.log(`Credited ${commissionCents} cents referral commission to ${referral.referrer_id}`);
                }
              }
            } catch (err) {
              console.error('Error processing referral commission on subscription:', err);
            }
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

          const { data: existingProfile, error: existingProfileError } = await supabase
            .from('profiles')
            .select('is_creator_subscribed')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileError) {
            console.error('Error loading profile for subscription update:', existingProfileError);
          }

          const wasSubscribed = existingProfile?.is_creator_subscribed === true;

          const updatePayload: Record<string, unknown> = { is_creator_subscribed: isActive };
          if (isActive && !wasSubscribed) {
            updatePayload.show_join_banner = false;
            updatePayload.show_certification = true;
            updatePayload.show_deeplinks = true;
            updatePayload.show_available_now = true;
          }
          if (!isActive && wasSubscribed) {
            updatePayload.show_join_banner = true;
            updatePayload.show_certification = false;
            updatePayload.show_deeplinks = false;
            updatePayload.show_available_now = false;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
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
          const { data: existingProfile, error: existingProfileError } = await supabase
            .from('profiles')
            .select('is_creator_subscribed')
            .eq('id', userId)
            .maybeSingle();

          if (existingProfileError) {
            console.error('Error loading profile for subscription deletion:', existingProfileError);
          }

          const wasSubscribed = existingProfile?.is_creator_subscribed === true;

          const updatePayload: Record<string, unknown> = { is_creator_subscribed: false };
          if (wasSubscribed) {
            updatePayload.show_join_banner = true;
            updatePayload.show_certification = false;
            updatePayload.show_deeplinks = false;
            updatePayload.show_available_now = false;
          }

          const { error: updateError } = await supabase
            .from('profiles')
            .update(updatePayload)
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

          // Load previous status + email flag so we can send an email exactly once when the
          // account becomes active.
          const { data: existingProfile, error: profileLoadError } = await supabase
            .from('profiles')
            .select('stripe_connect_status, stripe_verified_email_sent_at, display_name')
            .eq('id', userId)
            .maybeSingle();

          if (profileLoadError) {
            console.error('Error loading profile for Connect status update:', profileLoadError);
          }

          const previousStatus = existingProfile?.stripe_connect_status ?? null;
          const emailAlreadySent = Boolean(existingProfile?.stripe_verified_email_sent_at);

          const { error: updateError } = await supabase
            .from('profiles')
            .update({ stripe_connect_status: connectStatus })
            .eq('id', userId);

          if (updateError) {
            console.error('Error updating Connect status:', updateError);
          } else {
            console.log('Connect status updated for user:', userId, 'status:', connectStatus);
          }

          const becameComplete = connectStatus === 'complete' && previousStatus !== 'complete';

          if (becameComplete && !emailAlreadySent) {
            try {
              const { data: authUser, error: authError } = await supabase.auth.admin.getUserById(userId);
              if (authError) {
                console.error('Error loading auth user for Stripe verified email:', authError);
              }

              const creatorEmail = authUser?.user?.email ?? null;
              if (!creatorEmail) {
                console.warn('No creator email found; skipping Stripe verified email for user:', userId);
                break;
              }

              const base = (siteUrl || 'https://exclu.at').replace(/\/$/, '');
              const paymentsUrl = `${base}/app/profile#payments`;

              const emailSent = await sendStripeVerifiedEmail(
                creatorEmail,
                existingProfile?.display_name ?? null,
                paymentsUrl,
              );

              if (emailSent) {
                const { error: emailFlagError } = await supabase
                  .from('profiles')
                  .update({ stripe_verified_email_sent_at: new Date().toISOString() })
                  .eq('id', userId);

                if (emailFlagError) {
                  console.error('Error setting stripe_verified_email_sent_at:', emailFlagError);
                }
              }
            } catch (emailErr) {
              console.error('Error sending Stripe verified email:', emailErr);
            }
          }
        }
        break;
      }

      // Handle successful subscription payments (new & renewals) for affiliate tracking
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | undefined;

        // Only trigger on subscription invoices, specifically for the creator tier.
        if (subscriptionId && invoice.amount_paid > 0) {
          // Fetch the subscription to get the user ID
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.supabase_user_id;

          if (userId) {
            // Check if this user was referred by someone and their referral status isn't inactive
            const { data: referralData, error: referralError } = await supabase
              .from('referrals')
              .select('id, referrer_id, status, commission_earned_cents')
              .eq('referred_id', userId)
              .neq('status', 'inactive')
              .maybeSingle();

            if (referralError) {
              console.error('Error fetching referral data for invoice.paid:', referralError);
            }

            if (referralData && referralData.referrer_id) {
              // Calculate 35% commission logic
              const commissionCents = Math.round(invoice.amount_paid * 0.35);

              // 1. Update the referral tracking row
              const newTotalCommission = (referralData.commission_earned_cents || 0) + commissionCents;

              const updatePayload: Record<string, unknown> = {
                commission_earned_cents: newTotalCommission,
                status: 'converted'
              };
              if (referralData.status !== 'converted') {
                updatePayload.converted_at = new Date().toISOString();
              }

              await supabase
                .from('referrals')
                .update(updatePayload)
                .eq('id', referralData.id);

              // 2. Credit the referrer's affiliate earnings
              const { data: referrerProfile } = await supabase
                .from('profiles')
                .select('affiliate_earnings_cents')
                .eq('id', referralData.referrer_id)
                .single();

              if (referrerProfile) {
                const updatedEarnings = (referrerProfile.affiliate_earnings_cents || 0) + commissionCents;
                await supabase
                  .from('profiles')
                  .update({ affiliate_earnings_cents: updatedEarnings })
                  .eq('id', referralData.referrer_id);

                console.log(`Affiliate credited! Referrer ${referralData.referrer_id} earned ${commissionCents} cents from invoice ${invoice.id}`);
              }
            }
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
