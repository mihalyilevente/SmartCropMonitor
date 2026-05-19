// context/FontSizeContext.jsx
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';

const FontSizeContext = createContext(null);

export const FontSizeProvider = ({ children }) => {
  const [largeFonts, setLargeFonts] = useState(
    () => localStorage.getItem('largeFonts') === 'true'
  );

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