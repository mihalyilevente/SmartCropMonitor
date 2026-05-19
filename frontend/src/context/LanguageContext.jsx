// context/LanguageContext.jsx
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import en from '../locales/en';
import hu from '../locales/hu';
import fr from '../locales/fr';
import de from '../locales/de';

const locales = { en, hu, fr, de };

const LanguageContext = createContext(null);

export const LanguageProvider = ({ children }) => {
  const [lang, setLang] = useState(
    () => localStorage.getItem('lang') || 'hu'
  );

  const switchLang = (l) => {
    setLang(l);
    localStorage.setItem('lang', l);
  };

  const t = (key, ...args) => {
    const val = locales[lang]?.[key] ?? locales['en']?.[key] ?? key;
    return typeof val === 'function' ? val(...args) : val;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: switchLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => useContext(LanguageContext);