// base64 decoding used for profile photo uploads. Run with: npm run test:coach
import assert from 'node:assert/strict';
import { it } from 'node:test';

import { base64ToBytes } from '../src/lib/avatar-upload-bytes.ts';

it('decodes base64 exactly like Buffer does', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100, 1001]) {
    const bytes = Buffer.from(Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256));
    const b64 = bytes.toString('base64');
    assert.deepEqual(Buffer.from(base64ToBytes(b64)), bytes, `length ${len}`);
    assert.deepEqual(Buffer.from(base64ToBytes(b64.replace(/(.{76})/g, '$1\n'))), bytes, 'with line breaks');
  }
});
