// These checks validate deployment data, not the signed-in owner's identity.
export function applicationOrigin(value: string): URL {
  const url = new URL(value);
  const dnsHostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
  // Require one canonical HTTPS DNS origin, with no credentials, port or path.
  if (url.protocol !== 'https:' || url.origin !== value || url.port || !dnsHostname.test(url.hostname)) {
    throw new Error('Invalid application origin');
  }
  return url;
}

export function ownerWebsite(value?: string): URL | null {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || value.length > 2048) {
    throw new Error('Invalid owner website');
  }
  return url;
}
