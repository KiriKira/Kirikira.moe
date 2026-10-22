import { describe, expect, it } from 'vitest';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/web/pbkdf2';
import { checkPow, issueChallenge } from '../src/lib/comments/pow';

const SECRET = 'test-secret-0123456789abcdef0123456789';

describe('proof of work', () => {
  it('accepts a solved challenge for the right post and reports elapsed time', async () => {
    const now = Date.now();
    const challenge = await issueChallenge(SECRET, 'post-1', now);
    const solution = await solveChallenge({ challenge, deriveKey });
    const check = await checkPow({ challenge, solution }, SECRET, 'post-1', now + 5000);
    expect(check.status).toBe('ok');
    expect(check.elapsedMs).toBe(5000);
    expect(check.nonce).toBe(challenge.parameters.nonce);
  });

  it('rejects a challenge issued for another post', async () => {
    const challenge = await issueChallenge(SECRET, 'post-1');
    const solution = await solveChallenge({ challenge, deriveKey });
    expect((await checkPow({ challenge, solution }, SECRET, 'post-2')).status).toBe('wrong-post');
  });

  it('rejects tampered parameters, wrong secrets, bad solutions and garbage', async () => {
    const challenge = await issueChallenge(SECRET, 'post-1');
    const solution = await solveChallenge({ challenge, deriveKey });
    const tampered = { ...challenge, parameters: { ...challenge.parameters, data: { post: 'post-1', iat: 0 } } };
    expect((await checkPow({ challenge: tampered, solution }, SECRET, 'post-1')).status).toBe('invalid');
    expect((await checkPow({ challenge, solution }, `${SECRET}x`, 'post-1')).status).toBe('invalid');
    expect((await checkPow({ challenge, solution: { ...solution, derivedKey: '00' } }, SECRET, 'post-1')).status).toBe('invalid');
    expect((await checkPow(null, SECRET, 'post-1')).status).toBe('missing');
    expect((await checkPow({ challenge: 'x', solution: 1 }, SECRET, 'post-1')).status).toBe('missing');
  });
});
