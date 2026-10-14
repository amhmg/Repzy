import { ReactNode, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RepzyColors, useRepzyColors } from '@/constants/repzy-colors';
import type { DailyLog } from '@/lib/coach/analysis';
import * as haptics from '@/lib/haptics';
import { localDate, saveDailyLog } from '@/lib/daily-log';

// Today's check-in: bodyweight, sleep, soreness, energy, calories, protein. All optional.

const SORENESS = ['None', 'Light', 'Some', 'Sore', 'Very sore'];
const ENERGY = ['Exhausted', 'Low', 'OK', 'Good', 'Great'];

function parse(text: string, min: number, max: number, label: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} should be between ${min} and ${max}.`);
  return Math.round(n * 10) / 10;
}

export default function DailyCheckIn({
  today,
  onClose,
  onSaved,
}: {
  today: DailyLog | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const c = useRepzyColors();
  const [bodyweight, setBodyweight] = useState(today?.bodyweight != null ? String(today.bodyweight) : '');
  const [sleep, setSleep] = useState(today?.sleep != null ? String(today.sleep) : '');
  const [soreness, setSoreness] = useState<number | null>(today?.soreness ?? null);
  const [energy, setEnergy] = useState<number | null>(today?.energy ?? null);
  const [calories, setCalories] = useState(today?.calories != null ? String(today.calories) : '');
  const [protein, setProtein] = useState(today?.protein != null ? String(today.protein) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      const values = {
        bodyweight: parse(bodyweight, 20, 400, 'Bodyweight'),
        sleep: parse(sleep, 0, 24, 'Sleep'),
        soreness,
        energy,
        calories: (() => {
          const v = parse(calories, 0, 20000, 'Calories');
          return v == null ? null : Math.round(v);
        })(),
        protein: parse(protein, 0, 1000, 'Protein'),
      };
      if (Object.values(values).every((v) => v == null)) {
        setError('Fill in at least one thing.');
        return;
      }
      setSaving(true);
      await saveDailyLog(localDate(), values);
      haptics.notify(haptics.NotifyType.Success);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
        <View style={[styles.header, { borderBottomColor: c.border }]}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.side}>
            <Text style={{ color: c.accent, fontSize: 16, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Text style={[styles.title, { color: c.text }]}>Today&apos;s check-in</Text>
          <Pressable onPress={save} disabled={saving} hitSlop={10} style={[styles.side, { alignItems: 'flex-end' }]}>
            {saving ? (
              <ActivityIndicator />
            ) : (
              <Text style={{ color: c.accent, fontSize: 16, fontWeight: '800' }}>Save</Text>
            )}
          </Pressable>
        </View>

        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={[styles.hint, { color: c.subtext }]}>
              Everything is optional. The coach uses this to explain your progress. Only you can see it.
            </Text>

            <Section title="Recovery" colors={c}>
              <Field label="Sleep last night" unit="hours" value={sleep} onChange={setSleep} colors={c} placeholder="e.g. 7.5" />
              <Text style={[styles.label, { color: c.subtext }]}>Soreness</Text>
              <Scale options={SORENESS} value={soreness} onChange={setSoreness} colors={c} />
              <Text style={[styles.label, { color: c.subtext }]}>Energy</Text>
              <Scale options={ENERGY} value={energy} onChange={setEnergy} colors={c} />
            </Section>

            <Section title="Body" colors={c}>
              <Field label="Bodyweight" unit="kg" value={bodyweight} onChange={setBodyweight} colors={c} placeholder="e.g. 78.4" />
            </Section>

            <Section title="Food today" colors={c}>
              <Field label="Calories" unit="kcal" value={calories} onChange={setCalories} colors={c} placeholder="e.g. 2600" />
              <Field label="Protein" unit="g" value={protein} onChange={setProtein} colors={c} placeholder="e.g. 150" />
            </Section>

            {error && <Text style={{ color: c.error, textAlign: 'center' }}>{error}</Text>}

            <Pressable
              onPress={save}
              disabled={saving}
              style={({ pressed }) => [styles.saveButton, { backgroundColor: c.accent, opacity: pressed || saving ? 0.7 : 1 }]}>
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save check-in'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Section({ title, colors: c, children }: { title: string; colors: RepzyColors; children: ReactNode }) {
  return (
    <View style={[styles.section, { backgroundColor: c.card }]}>
      <Text style={[styles.sectionTitle, { color: c.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  placeholder,
  colors: c,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (t: string) => void;
  placeholder: string;
  colors: RepzyColors;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: c.text }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={c.subtext}
        style={[styles.input, { backgroundColor: c.inputBg, color: c.text }]}
        maxLength={6}
        accessibilityLabel={`${label} in ${unit}`}
      />
      <Text style={[styles.unit, { color: c.subtext }]}>{unit}</Text>
    </View>
  );
}

function Scale({
  options,
  value,
  onChange,
  colors: c,
}: {
  options: string[];
  value: number | null;
  onChange: (v: number | null) => void;
  colors: RepzyColors;
}) {
  return (
    <View style={styles.scale}>
      {options.map((label, i) => {
        const v = i + 1;
        const selected = value === v;
        return (
          <Pressable
            key={label}
            onPress={() => onChange(selected ? null : v)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.scaleItem, { backgroundColor: selected ? c.accent : c.inputBg }]}>
            <Text style={{ color: selected ? '#FFFFFF' : c.text, fontWeight: '800' }}>{v}</Text>
            <Text style={{ color: selected ? '#FFFFFF' : c.subtext, fontSize: 10, textAlign: 'center' }} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  side: { width: 70 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800' },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { fontSize: 13, lineHeight: 18 },
  section: { borderRadius: 16, padding: 14, gap: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 13, fontWeight: '700' },
  field: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  fieldLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  input: { width: 100, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, textAlign: 'right' },
  unit: { width: 40, fontSize: 13 },
  scale: { flexDirection: 'row', gap: 6 },
  scaleItem: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', gap: 2 },
  saveButton: { borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800' },
});
