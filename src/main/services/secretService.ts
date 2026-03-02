import keytar from 'keytar'

const SERVICE = 'automation-console'

export async function saveSecret(ref: string, value: string): Promise<void> {
  await keytar.setPassword(SERVICE, ref, value)
}

export async function deleteSecret(ref: string): Promise<void> {
  await keytar.deletePassword(SERVICE, ref)
}

export async function getSecret(ref: string): Promise<string | null> {
  return keytar.getPassword(SERVICE, ref)
}

export function buildProfileSecretRef(profileId: string, key: string): string {
  return `profile:${profileId}:${key}`
}

export function buildProxySecretRef(proxyId: string): string {
  return `proxy:${proxyId}:password`
}

export function buildSiteSettingsSecretRef(siteKey: string): string {
  return `site:${siteKey}:password`
}
