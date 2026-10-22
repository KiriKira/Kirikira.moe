/** HMAC-SHA256(secret, value) as hex. Used to store IPs without keeping them. */
export async function hmacHex(secret: string, value: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(value));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashIp(secret: string, ip: string | null): Promise<string | null> {
  if (!ip) return null;
  // Truncated: plenty for matching, less useful if the table ever leaks.
  return (await hmacHex(`${secret}:ip`, ip)).slice(0, 32);
}
