import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,existsSync } from 'node:fs';
import { products,seedPosts } from '../src/lib/data';

test('every catalog and feed image resolves to a bundled local asset', () => {
  for(const path of [...products.flatMap(p=>[p.image,...p.variants.map(v=>v.image)]),...seedPosts.map(p=>p.image).filter(Boolean),'/images/ggo-wordmark.png','/images/ggo-emblem.png']) assert.ok(existsSync(`public${path}`),path);
});
test('PWA has standalone install icons and an offline fallback', () => {
  const manifest=JSON.parse(readFileSync('public/manifest.webmanifest','utf8'));
  assert.equal(manifest.display,'standalone'); assert.equal(manifest.lang,'vi');
  for(const icon of manifest.icons) assert.ok(existsSync(`public${icon.src}`));
  assert.ok(existsSync('public/offline.html'));
});
