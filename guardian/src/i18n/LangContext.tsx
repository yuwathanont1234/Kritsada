import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { strings, Language } from './strings';

/**
 * Language context lives in its own module (not App.tsx) so screens and
 * components can import useLang() without creating a circular dependency back
 * to the root component.
 */

const LANG_KEY = '@guardian/lang';

type LangContextType = {
  lang: Language;
  setLang: (l: Language) => void;
  t: (path: string) => string;
};

const LangContext = createContext<LangContextType>({
  lang: 'th',
  setLang: () => {},
  t: (p) => p,
});

export function useLang() {
  return useContext(LangContext);
}

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('th');

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((saved) => {
      if (saved === 'th' || saved === 'en') setLangState(saved);
    });
  }, []);

  const setLang = useCallback(async (l: Language) => {
    setLangState(l);
    await AsyncStorage.setItem(LANG_KEY, l);
  }, []);

  // Resolve 'section.key' against the active language, falling back to Thai
  // then the raw path so a missing key is visible rather than blank.
  const t = useCallback(
    (path: string): string => {
      const keys = path.split('.');
      const dig = (root: unknown): string | undefined => {
        let o: unknown = root;
        for (const k of keys) {
          if (o && typeof o === 'object' && k in (o as Record<string, unknown>)) {
            o = (o as Record<string, unknown>)[k];
          } else {
            return undefined;
          }
        }
        return typeof o === 'string' ? o : undefined;
      };
      return dig(strings[lang]) ?? dig(strings.th) ?? path;
    },
    [lang]
  );

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}
