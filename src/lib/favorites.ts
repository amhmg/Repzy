import { useCallback, useEffect, useState } from 'react';

import * as haptics from '@/lib/haptics';
import { supabase } from '@/lib/supabase';

// Favourite exercises, stored on the account so they follow you to other devices.
export function useFavorites() {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('favorite_exercises')
      .select('exercise_name')
      .then(({ data }) => {
        if (cancelled) return;
        setFavorites(new Set((data ?? []).map((r: { exercise_name: string }) => r.exercise_name.toLowerCase())));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isFavorite = useCallback((name: string) => favorites.has(name.toLowerCase()), [favorites]);

  const toggleFavorite = useCallback(
    async (name: string) => {
      const key = name.toLowerCase();
      const adding = !favorites.has(key);
      haptics.selection();
      // update straight away, undo if the server says no
      setFavorites((prev) => {
        const next = new Set(prev);
        if (adding) next.add(key);
        else next.delete(key);
        return next;
      });
      const { error } = adding
        ? await supabase.from('favorite_exercises').insert({ exercise_name: name })
        : await supabase.from('favorite_exercises').delete().ilike('exercise_name', name);
      if (error && !(adding && error.code === '23505')) {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (adding) next.delete(key);
          else next.add(key);
          return next;
        });
      }
    },
    [favorites],
  );

  return { favorites, isFavorite, toggleFavorite, loaded };
}
