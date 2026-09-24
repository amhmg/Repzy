import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    useColorScheme,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

type Mode = 'login' | 'signup';

const lightColors = {
  background: '#FFFFFF',
  text: '#111111',
  subtext: '#666666',
  inputBg: '#F2F2F2',
  border: '#E0E0E0',
  accent: '#FF5A1F',
  error: '#D93025',
  success: '#1E8E3E',
};

const darkColors = {
  background: '#0E0E0E',
  text: '#F5F5F5',
  subtext: '#9A9A9A',
  inputBg: '#1C1C1C',
  border: '#2A2A2A',
  accent: '#FF6B35',
  error: '#FF6B6B',
  success: '#4CD964',
};

// ---------- Email checking ----------

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

const POPULAR_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'outlook.com',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'mail.com',
  'protonmail.com',
  'proton.me',
  'btinternet.com',
  'sky.com',
];

// How many single-letter edits turn one word into another
function editDistance(a: string, b: string): number {
  const dp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    dp.push([i]);
    for (let j = 1; j <= b.length; j++) dp[i][j] = i === 0 ? j : 0;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

// Returns a popular domain if the typed one looks like a typo of it
function suggestDomain(domain: string): string | null {
  if (!domain || POPULAR_DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bestDistance = 3; // only suggest if 1–2 letters off
  for (const candidate of POPULAR_DOMAINS) {
    const distance = editDistance(domain, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function friendlyError(message: string) {
  if (message.includes('Invalid login credentials')) return 'Wrong email or password.';
  if (message.includes('Email not confirmed')) return 'Please confirm your email first. Check your inbox.';
  if (message.includes('already registered')) return 'An account with this email already exists. Try logging in.';
  if (message.includes('Database error saving new user')) return 'That username is taken.';
  return message;
}

// ---------- Screen ----------

export default function AuthScreen() {
  const c = useColorScheme() === 'dark' ? darkColors : lightColors;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [warnedEmail, setWarnedEmail] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setMessage(null);
    setSuggestion(null);
    setWarnedEmail(null);
  }

  function acceptSuggestion() {
    if (suggestion) setEmail(suggestion);
    setSuggestion(null);
    setError(null);
  }

  async function handleSubmit() {
    setError(null);
    setMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim().toLowerCase();

    if (!cleanEmail || !password) {
      setError('Please enter your email and password.');
      return;
    }

    const [localPart, domain = ''] = cleanEmail.split('@');
    const betterDomain = suggestDomain(domain);

    // Not a valid email at all: block, and suggest a fix if we have one
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setError('Please enter a valid email address.');
      setSuggestion(betterDomain ? `${localPart}@${betterDomain}` : null);
      return;
    }

    // Looks like a typo: ask once, let them continue if they tap Sign up again
    if (mode === 'signup' && betterDomain && cleanEmail !== warnedEmail) {
      setSuggestion(`${localPart}@${betterDomain}`);
      setWarnedEmail(cleanEmail);
      return;
    }

    if (mode === 'signup') {
      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
        setError('Username must be 3–20 characters: letters, numbers or underscores.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setSuggestion(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (error) setError(friendlyError(error.message));
      } else {
        const { data: taken } = await supabase
          .from('profiles')
          .select('id')
          .eq('username', cleanUsername)
          .maybeSingle();

        if (taken) {
          setError('That username is taken.');
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { username: cleanUsername } },
        });

        if (error) {
          setError(friendlyError(error.message));
        } else if (!data.session) {
          switchMode('login');
          setMessage('Account created! Check your email to confirm, then log in.');
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = [styles.input, { backgroundColor: c.inputBg, borderColor: c.border, color: c.text }];

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.logo, { color: c.accent }]}>Repzy</Text>
          <Text style={[styles.tagline, { color: c.subtext }]}>Train together. Stay accountable.</Text>

          <Text style={[styles.heading, { color: c.text }]}>
            {mode === 'login' ? 'Welcome back' : 'Create your account'}
          </Text>

          {mode === 'signup' && (
            <TextInput
              style={inputStyle}
              placeholder="Username"
              placeholderTextColor={c.subtext}
              autoCapitalize="none"
              autoCorrect={false}
              value={username}
              onChangeText={setUsername}
            />
          )}

          <TextInput
            style={inputStyle}
            placeholder="Email"
            placeholderTextColor={c.subtext}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setSuggestion(null);
              setWarnedEmail(null);
            }}
          />

          {suggestion && (
            <Pressable onPress={acceptSuggestion} style={[styles.suggestionBox, { borderColor: c.accent }]}>
              <Text style={{ color: c.text }}>
                Did you mean <Text style={{ color: c.accent, fontWeight: '700' }}>{suggestion}</Text>?
              </Text>
              <Text style={[styles.suggestionHint, { color: c.subtext }]}>
                Tap here to fix it
                {mode === 'signup' && !error ? ', or tap Sign up again to keep what you typed' : ''}
              </Text>
            </Pressable>
          )}

          <TextInput
            style={inputStyle}
            placeholder="Password"
            placeholderTextColor={c.subtext}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={handleSubmit}
          />

          {error && <Text style={[styles.feedback, { color: c.error }]}>{error}</Text>}
          {message && <Text style={[styles.feedback, { color: c.success }]}>{message}</Text>}

          <Pressable
            onPress={handleSubmit}
            disabled={loading}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: c.accent, opacity: pressed || loading ? 0.7 : 1 },
            ]}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonText}>{mode === 'login' ? 'Log in' : 'Sign up'}</Text>
            )}
          </Pressable>

          <View style={styles.switchRow}>
            <Text style={{ color: c.subtext }}>
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            </Text>
            <Pressable onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')}>
              <Text style={[styles.switchLink, { color: c.accent }]}>
                {mode === 'login' ? 'Sign up' : 'Log in'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 12,
  },
  logo: { fontSize: 44, fontWeight: '800', textAlign: 'center', letterSpacing: -1 },
  tagline: { fontSize: 15, textAlign: 'center', marginBottom: 24 },
  heading: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  suggestionBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  suggestionHint: { fontSize: 12 },
  feedback: { fontSize: 14, textAlign: 'center' },
  button: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  switchLink: { fontWeight: '700' },
});