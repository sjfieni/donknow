import { randomBytes, createCipheriv, createDecipheriv, createHmac, createHash } from 'node:crypto';
import { readFile, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
export function configuredTokenKey(env = process.env) {
  if (env.INTEGRATION_TOKEN_KEY) { const key = Buffer.from(env.INTEGRATION_TOKEN_KEY, 'base64'); if (key.length !== 32) throw new Error('INTEGRATION_TOKEN_KEY must be a base64-encoded 32-byte key'); return key; }
  if (env.INTEGRATION_KEY_SEED) {
    if (env.INTEGRATION_KEY_SEED.length < 32) throw new Error('INTEGRATION_KEY_SEED must contain at least 32 random characters');
    return createHash('sha256').update('duckduck:integration-key:v1:').update(env.INTEGRATION_KEY_SEED).digest();
  }
  return null;
}
export async function secretBox(directory, supplied = process.env.INTEGRATION_TOKEN_KEY, seed = process.env.INTEGRATION_KEY_SEED) {
  let key = configuredTokenKey({ INTEGRATION_TOKEN_KEY: supplied, INTEGRATION_KEY_SEED: seed });
  if (!key) {
    const path = join(directory, '.token-key');
    try { key = await readFile(path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; try { await writeFile(path, randomBytes(32), { flag: 'wx', mode: 0o600 }); } catch (e) { if (e.code !== 'EEXIST') throw e; } key = await readFile(path); }
    if (key.length !== 32) throw new Error('Stored encryption key is invalid');
    await chmod(path, 0o600);
  }
  return {
    fingerprint: createHash('sha256').update(key).digest('hex'),
    seal(value) { const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce); const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]); return [nonce, cipher.getAuthTag(), encrypted].map(item => item.toString('base64')).join('.'); },
    open(value) { const parts = value.split('.'); if (parts.length !== 3) throw new Error('Invalid encrypted record'); const [nonce, tag, encrypted] = parts.map(part => Buffer.from(part, 'base64')); const decipher = createDecipheriv('aes-256-gcm', key, nonce); decipher.setAuthTag(tag); return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')); },
    hash(value) { return createHmac('sha256', key).update(value).digest('hex'); },
  };
}
export const fail = (status, message) => Object.assign(new Error(message), { status });
