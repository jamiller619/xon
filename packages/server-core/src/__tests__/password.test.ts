import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../password.js';

describe('password hashing', () => {
  it('hashes a password and verifies it correctly', async () => {
    const password = 'supersecretpassword123';
    const hashed = await hashPassword(password);

    expect(hashed).not.toBe(password);
    expect(hashed).toMatch(/^\$argon2/);
    await expect(verifyPassword(hashed, password)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hashed = await hashPassword('correctpassword');
    await expect(verifyPassword(hashed, 'wrongpassword')).resolves.toBe(false);
  });

  it('produces different hashes for the same password (salted)', async () => {
    const password = 'samepassword';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    expect(hash1).not.toBe(hash2);
  });
});
