import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '../config/env.js';

const key = createHash('sha256').update(env.ENCRYPTION_KEY).digest();

export function encryptSecret(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const plaintext = typeof value === 'string' ? value : JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(value: string): string {
  const [ivValue, tagValue, payloadValue] = value.split('.');
  if (!ivValue || !tagValue || !payloadValue) throw new Error('Invalid encrypted secret');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
