import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import faTranslations from './fa.json';
import enTranslations from './en.json';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      fa: {
        translation: faTranslations,
      },
      en: {
        translation: enTranslations,
      },
    },
    lng: 'fa', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already safes from XSS
    },
  });

export default i18n;
