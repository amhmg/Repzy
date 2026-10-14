import type { DailyLog } from '@/lib/coach/analysis';
import { supabase } from '@/lib/supabase';

// Daily check-in (bodyweight, food, recovery). One row per day; every field optional.

type Row = {
  log_date: string;
  bodyweight_kg: number | string | null;
  calories: number | null;
  protein_g: number | string | null;
  sleep_hours: number | string | null;
  soreness: number | null;
  energy: number | null;
};

const num = (v: number | string | null) => (v == null || v === '' ? null : Number(v));

function toLog(r: Row): DailyLog {
  return {
    date: r.log_date,
    bodyweight: num(r.bodyweight_kg),
    calories: num(r.calories),
    protein: num(r.protein_g),
    sleep: num(r.sleep_hours),
    soreness: num(r.soreness),
    energy: num(r.energy),
  };
}

// Local calendar date as YYYY-MM-DD
export function localDate(d: Date = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isMissingTable(error: { message?: string; code?: string } | null) {
  return !!error && (error.code === '42P01' || error.code === 'PGRST205' || /daily_logs/.test(error.message ?? ''));
}

// Last `days` days, oldest first. `available` is false until the database update is installed.
export async function fetchDailyLogs(days = 120): Promise<{ logs: DailyLog[]; available: boolean }> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date, bodyweight_kg, calories, protein_g, sleep_hours, soreness, energy')
    .gte('log_date', localDate(since))
    .order('log_date', { ascending: true });
  if (error) {
    if (isMissingTable(error)) return { logs: [], available: false };
    throw error;
  }
  return { logs: ((data ?? []) as Row[]).map(toLog), available: true };
}

export type DailyLogInput = Omit<DailyLog, 'date'>;

export async function saveDailyLog(date: string, values: DailyLogInput) {
  const { data: auth } = await supabase.auth.getSession();
  const userId = auth.session?.user.id;
  if (!userId) throw new Error('Please log in again.');
  const { error } = await supabase.from('daily_logs').upsert(
    {
      user_id: userId,
      log_date: date,
      bodyweight_kg: values.bodyweight,
      calories: values.calories,
      protein_g: values.protein,
      sleep_hours: values.sleep,
      soreness: values.soreness,
      energy: values.energy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,log_date' },
  );
  if (error) {
    if (isMissingTable(error)) throw new Error('The check-in needs the latest database update. Run the SQL from the update notes first.');
    throw error;
  }
}
