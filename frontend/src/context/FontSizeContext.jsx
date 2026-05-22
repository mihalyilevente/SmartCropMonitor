import { createContext, useContext, useState, useEffect } from 'react';

const FontSizeContext = createContext(null);

export const FontSizeProvider = ({ children }) => {
  const [largeFonts, setLargeFonts] = useState(
    () => localStorage.getItem('largeFonts') === 'true'
  );

  useEffect(() => {
    if (largeFonts) {
      document.documentElement.classList.add('large-fonts');
    } else {
      document.documentElement.classList.remove('large-fonts');
    }
  }, [largeFonts]);

  const toggleFonts = () => {
    setLargeFonts(v => {
      const next = !v;
      localStorage.setItem('largeFonts', String(next));
      return next;
    });
  };

  return (
    <FontSizeContext.Provider value={{ largeFonts, toggleFonts }}>
      {children}
    </FontSizeContext.Provider>
  );
};

export const useFontSize = () => useContext(FontSizeContext);