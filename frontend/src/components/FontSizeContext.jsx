/**
 * FontSizeContext.jsx
 *
 * Provides a global "large font" toggle that:
 *   1. Adds/removes the class `large-fonts` on <html> element
 *   2. Persists the preference in localStorage under key `ui_large_fonts`
 *
 * Usage:
 *   // Wrap the app:
 *   <FontSizeProvider>
 *     <App />
 *   </FontSizeProvider>
 *
 *   // Consume anywhere:
 *   const { largeFonts, toggleFonts } = useFontSize();
 */
import { createContext, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'ui_large_fonts';

const FontSizeContext = createContext({
  largeFonts: false,
  toggleFonts: () => {},
});

export const FontSizeProvider = ({ children }) => {
  const [largeFonts, setLargeFonts] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );

  // Sync class on <html> whenever state changes
  useEffect(() => {
    const root = document.documentElement;
    if (largeFonts) {
      root.classList.add('large-fonts');
    } else {
      root.classList.remove('large-fonts');
    }
    localStorage.setItem(STORAGE_KEY, String(largeFonts));
  }, [largeFonts]);

  const toggleFonts = () => setLargeFonts(v => !v);

  return (
    <FontSizeContext.Provider value={{ largeFonts, toggleFonts }}>
      {children}
    </FontSizeContext.Provider>
  );
};

export const useFontSize = () => useContext(FontSizeContext);