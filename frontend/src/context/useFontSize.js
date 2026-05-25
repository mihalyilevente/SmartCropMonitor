import { useContext } from 'react';
import FontSizeContext from './fontSizeContextValue';

export const useFontSize = () => useContext(FontSizeContext);
