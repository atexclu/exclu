#!/usr/bin/env node
// One-off uploader for the onboarding tutorial video. Uses TUS resumable
// upload via tus-js-client because the standard Supabase Storage POST
// endpoint caps payloads at ~50 MB at the proxy layer; TUS handles chunked
// resumable uploads up to the bucket's file_size_limit (300 MB here).
//
// Usage:
//   SUPABASE_URL=... SERVICE_ROLE_KEY=... node scripts/upload-tutorial-to-storage.mjs

import * as tus from 'tus-js-client';
import { createReadStream, statSync } from 'node:fs';
import { resolve } from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY env vars');
  process.exit(1);
}

const bucket = 'public-assets';
const objectName = 'onboarding/tutorial.mp4';
const filePath = resolve('src/assets/onboarding/tutorial.mp4');
const stat = statSync(filePath);

console.log(`Uploading ${filePath} (${(stat.size / 1024 / 1024).toFixed(1)} MB) → ${bucket}/${objectName}`);

const stream = createReadStream(filePath);

await new Promise((resolve, reject) => {
  const upload = new tus.Upload(stream, {
    endpoint: `${url}/storage/v1/upload/resumable`,
    headers: {
      authorization: `Bearer ${key}`,
      'x-upsert': 'true',
    },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    metadata: {
      bucketName: bucket,
      objectName,
      contentType: 'video/mp4',
      cacheControl: '31536000',
    },
    chunkSize: 6 * 1024 * 1024, // 6 MB — Supabase TUS minimum
    uploadSize: stat.size,
    onError: (err) => {
      console.error('Upload error:', err);
      reject(err);
    },
    onProgress: (bytesUploaded, bytesTotal) => {
      const pct = ((bytesUploaded / bytesTotal) * 100).toFixed(1);
      process.stdout.write(`\rProgress: ${pct}% (${(bytesUploaded / 1024 / 1024).toFixed(1)} / ${(bytesTotal / 1024 / 1024).toFixed(1)} MB)`);
    },
    onSuccess: () => {
      process.stdout.write('\n');
      resolve();
    },
  });
  upload.start();
});

const publicUrl = `${url}/storage/v1/object/public/${bucket}/${objectName}`;
console.log('✓ Uploaded.');
console.log(`Public URL: ${publicUrl}`);
