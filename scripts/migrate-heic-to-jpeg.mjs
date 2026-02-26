/**
 * migrate-heic-to-jpeg.mjs
 *
 * Converts all existing HEIC/HEIF assets in Supabase storage to JPEG.
 * Updates storage_path and mime_type in the assets table accordingly.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/migrate-heic-to-jpeg.mjs
 *
 * Pass --dry-run to only list affected files without modifying anything.
 */

import { createClient } from '@supabase/supabase-js';
import heicConvert from 'heic-convert';

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKET = 'paid-content';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌  Missing env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

async function main() {
  console.log(`🔍  Fetching HEIC/HEIF assets from database…${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  // Find all assets with HEIC/HEIF mime type or .heic/.heif extension
  const { data: assets, error } = await supabase
    .from('assets')
    .select('id, title, storage_path, mime_type, creator_id')
    .or('mime_type.eq.image/heic,mime_type.eq.image/heif,storage_path.ilike.%.heic,storage_path.ilike.%.heif');

  if (error) {
    console.error('❌  Error fetching assets:', error.message);
    process.exit(1);
  }

  if (!assets || assets.length === 0) {
    console.log('✅  No HEIC/HEIF assets found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${assets.length} asset(s) to convert:\n`);
  for (const a of assets) {
    console.log(`  - [${a.id}] ${a.storage_path} (${a.mime_type})`);
  }

  if (DRY_RUN) {
    console.log('\n⚠️  Dry run — no changes made. Remove --dry-run to apply.');
    return;
  }

  console.log('\n🔄  Starting conversion…\n');

  let success = 0;
  let failed = 0;

  for (const asset of assets) {
    const originalPath = asset.storage_path;
    const newPath = originalPath.replace(/\.(heic|heif)$/i, '.jpg');

    try {
      // 1. Download the original HEIC file
      const { data: fileData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(originalPath);

      if (downloadError || !fileData) {
        console.error(`  ❌  [${asset.id}] Download failed: ${downloadError?.message}`);
        failed++;
        continue;
      }

      // 2. Convert HEIC → JPEG using heic-convert
      const arrayBuffer = await fileData.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);
      const jpegBuffer = await heicConvert({
        buffer: inputBuffer,
        format: 'JPEG',
        quality: 0.9,
      });

      // 3. Upload the converted JPEG
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, jpegBuffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error(`  ❌  [${asset.id}] Upload failed: ${uploadError.message}`);
        failed++;
        continue;
      }

      // 4. Update the asset record in the database
      const { error: updateError } = await supabase
        .from('assets')
        .update({
          storage_path: newPath,
          mime_type: 'image/jpeg',
        })
        .eq('id', asset.id);

      if (updateError) {
        console.error(`  ❌  [${asset.id}] DB update failed: ${updateError.message}`);
        failed++;
        continue;
      }

      // 5. Delete the original HEIC file from storage
      const { error: deleteError } = await supabase.storage
        .from(BUCKET)
        .remove([originalPath]);

      if (deleteError) {
        console.warn(`  ⚠️  [${asset.id}] Converted OK but could not delete original: ${deleteError.message}`);
      }

      console.log(`  ✅  [${asset.id}] ${originalPath} → ${newPath}`);
      success++;
    } catch (err) {
      console.error(`  ❌  [${asset.id}] Unexpected error: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🏁  Done. ${success} converted, ${failed} failed.`);
}

main();
