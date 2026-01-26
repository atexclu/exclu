import Stripe from 'npm:stripe';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY');
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
const supabaseUrl = Deno.env.get('PROJECT_URL');
const supabaseServiceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

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
    event = stripe.webhooks.constructEvent(body, signature, stripeWebhookSecret);
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
        if (session.mode === 'payment' && session.metadata?.link_id) {
          const linkId = session.metadata.link_id;
          const creatorId = session.metadata.creator_id;
          const amountTotal = session.amount_total ?? 0;

          // Check if purchase already exists (idempotency)
          const { data: existingPurchase } = await supabase
            .from('purchases')
            .select('id')
            .eq('stripe_session_id', session.id)
            .single();

          if (!existingPurchase) {
            const customerEmail = session.customer_details?.email ?? null;
            const { error: insertError } = await supabase.from('purchases').insert({
              link_id: linkId,
              creator_id: creatorId,
              amount_cents: amountTotal,
              currency: session.currency?.toUpperCase() ?? 'USD',
              stripe_session_id: session.id,
              status: 'completed',
              fan_email: customerEmail,
              buyer_email: customerEmail,
            });

            if (insertError) {
              console.error('Error inserting purchase:', insertError);
            } else {
              console.log('Purchase recorded for link:', linkId);
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
