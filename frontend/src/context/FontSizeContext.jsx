import { useState, useEffect } from 'react';
import FontSizeContext from './fontSizeContextValue';

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
