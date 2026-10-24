import { postJson } from './api'
import i18n, { type Language } from './i18n'

export type { Language }

/**
 * Switches the site's language. When signed in, it is saved to the account too, so emails come in the same
 * language. Returns false if saving to the account failed (the site still switches).
 */
export async function saveLanguage(language: Language, signedIn: boolean): Promise<boolean> {
  await i18n.changeLanguage(language)
  if (!signedIn) return true
  const result = await postJson('/api/v1/auth/preferences', { language }, { csrf: true })
  return result.ok
}
