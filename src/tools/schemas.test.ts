import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fileExtensionSchema } from './schemas.ts';

describe('fileExtensionSchema', () => {
  it('accepts a bare extension', () => {
    assert.deepEqual(fileExtensionSchema.parse('mp3'), 'mp3');
  });

  it('accepts a leading-dot extension', () => {
    assert.deepEqual(fileExtensionSchema.parse('.png'), '.png');
  });

  it('accepts undefined (optional)', () => {
    assert.deepEqual(fileExtensionSchema.parse(undefined), undefined);
  });

  it('rejects a slash in the extension', () => {
    assert.throws(() => fileExtensionSchema.parse('a/b'));
  });

  it('rejects an over-long value', () => {
    assert.throws(() => fileExtensionSchema.parse('toolongext'));
  });
});
