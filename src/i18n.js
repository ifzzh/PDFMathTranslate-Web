import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zh from './locales/zh.json'

const STORAGE_KEY = 'pdf-babel.locale'

const getDefaultLocale = () => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    return saved
  }

  const browserLocale = navigator.language.toLowerCase()
  if (browserLocale.startsWith('zh')) {
    return 'zh'
  }
  return 'en'
}

export default createI18n({
  locale: getDefaultLocale(),
  fallbackLocale: 'en',
  messages: {
    en,
    zh,
  },
  legacy: false,
})
