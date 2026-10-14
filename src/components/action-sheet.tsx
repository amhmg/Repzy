import { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useRepzyColors } from '@/constants/repzy-colors';

export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  selected?: boolean;
  disabled?: boolean;
  detail?: string;
};

// A bottom sheet of options with a Cancel button (works the same on iPhone and Android).
export default function ActionSheet({
  title,
  actions,
  onClose,
  children,
}: {
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
  children?: ReactNode; // extra controls above the actions
}) {
  const c = useRepzyColors();

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: c.card }]}>
          {title ? (
            <Text style={[styles.title, { color: c.subtext }]} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {children}
          <ScrollView style={styles.list} bounces={false}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                disabled={a.disabled}
                onPress={() => {
                  onClose();
                  a.onPress();
                }}
                style={({ pressed }) => [
                  styles.action,
                  {
                    backgroundColor: a.selected ? c.accentSoft : pressed ? c.inputBg : 'transparent',
                    opacity: a.disabled ? 0.35 : 1,
                  },
                ]}>
                <Text
                  style={[
                    styles.actionText,
                    { color: a.destructive ? c.error : a.selected ? c.accent : c.text },
                  ]}>
                  {a.label}
                </Text>
                {a.detail ? <Text style={{ color: c.subtext, fontSize: 12 }}>{a.detail}</Text> : null}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} style={[styles.cancel, { backgroundColor: c.inputBg }]}>
            <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingBottom: 28, gap: 8 },
  title: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  list: { maxHeight: 420 },
  action: { paddingVertical: 14, paddingHorizontal: 14, borderRadius: 12 },
  actionText: { fontSize: 17, fontWeight: '700' },
  cancel: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
});
