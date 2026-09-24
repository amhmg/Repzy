import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/lib/supabase';

export default function HomeScreen() {
  const [status, setStatus] = useState('Checking connection...');

  useEffect(() => {
    async function testConnection() {
   const { error } = await supabase.from('profiles').select('*').limit(1);
      if (error) {
        setStatus(`❌ Error: ${error.message}`);
        console.log('Supabase error:', error);
      } else {
        setStatus('✅ Connected to Supabase successfully!');
      }
    }

    testConnection();
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title">Repzy</ThemedText>
        <ThemedText style={styles.status}>{status}</ThemedText>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  safeArea: {
    alignItems: 'center',
    gap: 16,
  },
  status: {
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});