// These checks validate deployment data, not the signed-in owner's identity.
export function applicationOrigin(value: string): URL {
  const url = new URL(value);
  // Require the serialized origin, including ASCII/punycode for internationalized names.
  // Auth compares this value exactly; do not silently normalize credentials, ports or paths.
  if (url.protocol !== 'https:' || url.origin !== value || url.port) {
    throw new Error('Invalid application origin');
  }

  const labels = url.hostname.split('.');
  // Each label has 1–63 ASCII letters/digits/hyphens and no edge hyphens.
  // Apply the same rule to the TLD so xn-- punycode labels are accepted there too.
  const dnsLabel = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  // URL normalizes IPv4 literals (including short/hex forms) to dotted decimal.
  // IPv6 brackets/colons are rejected by the label rule below.
  const ipv4Host = /^[0-9.]+$/.test(url.hostname);
  if (
    labels.length < 2 ||
    url.hostname.length > 253 ||
    ipv4Host ||
    !labels.every(label => dnsLabel.test(label))
  ) {
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
