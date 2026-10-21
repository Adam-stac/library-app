import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'

export const SUPPORTED_LANGUAGES = ['ar', 'en'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

const STORAGE_KEY = 'language'
const DEFAULT_LANGUAGE: Language = 'ar'

function isLanguage(value: string | null): value is Language {
  return value !== null && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

// Read the saved choice; storage can be blocked (private mode), so never let it break the app.
function savedLanguage(): Language {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isLanguage(value) ? value : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

// Keep <html lang="..." dir="..."> in step with the language, so the whole page mirrors for Arabic.
function applyToDocument(language: string) {
  document.documentElement.lang = language
  document.documentElement.dir = i18n.dir(language)
  try {
    localStorage.setItem(STORAGE_KEY, language)
  } catch {
    // Storage unavailable: the choice just won't be remembered.
  }
}

i18n.on('languageChanged', applyToDocument)

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: savedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false }, // React already escapes output
})

export default i18n
