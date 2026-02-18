import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://qexnwezejlbwltyccks.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFleG53ZXplamxid2x0eWNja3MiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTczNTU2NTU0MywiZXhwIjoyMDUxMTQxNTQzfQ.wZ0xhbCOJqxLBPBJkKpIQrCwqRmVRUlcLKQSZqTxqJw';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLink() {
  console.log('Checking link: pour-toi-s56wfn\n');
  
  // Query the link
  const { data, error } = await supabase
    .from('links')
    .select('id, slug, title, status, show_on_profile, is_public, creator_id, created_at, published_at')
    .eq('slug', 'pour-toi-s56wfn')
    .single();
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Link data:');
  console.log(JSON.stringify(data, null, 2));
  
  // Check profile
  console.log('\n\nChecking creator profile...');
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, handle, display_name, stripe_connect_status')
    .eq('id', data.creator_id)
    .single();
  
  if (profileError) {
    console.error('Profile Error:', profileError);
    return;
  }
  
  console.log('Profile data:');
  console.log(JSON.stringify(profile, null, 2));
  
  // Check what would be visible
  console.log('\n\nVisibility check:');
  console.log('- Status:', data.status);
  console.log('- show_on_profile:', data.show_on_profile);
  console.log('- is_public:', data.is_public);
  console.log('- Stripe status:', profile.stripe_connect_status);
  
  console.log('\n\nWhy link might not be visible:');
  if (data.status !== 'published') {
    console.log('❌ Status is not "published"');
  } else {
    console.log('✅ Status is "published"');
  }
  
  if (!data.show_on_profile) {
    console.log('❌ show_on_profile is false');
  } else {
    console.log('✅ show_on_profile is true');
  }
  
  if (profile.stripe_connect_status !== 'complete') {
    console.log('❌ Stripe Connect is not complete');
  } else {
    console.log('✅ Stripe Connect is complete');
  }
  
  console.log('\n\nRLS Policy requirements:');
  console.log('For paid links to show on profile:');
  console.log('- status = "published" AND');
  console.log('- show_on_profile = true AND');
  console.log('- Stripe Connect status = "complete"');
}

checkLink();
