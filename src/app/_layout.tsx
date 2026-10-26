import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import AppTabs from '@/components/app-tabs';
import AuthScreen from '@/components/auth-screen';
import RepzySplash from '@/components/repzy-splash';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ProfileProvider } from '@/lib/profile';
import { SettingsProvider } from '@/lib/settings';
import { WorkoutSessionProvider } from '@/lib/workout-session';

SplashScreen.preventAutoHideAsync();

function RootContent() {
  const { session, loading, recovering } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session || recovering) return <AuthScreen />;

  const userId = session.user.id;
  // key={userId}: switching accounts starts every provider fresh, so no data leaks between accounts
  return (
    <SettingsProvider key={userId} userId={userId}>
      <ProfileProvider userId={userId}>
        <WorkoutSessionProvider userId={userId}>
          <AppTabs />
        </WorkoutSessionProvider>
      </ProfileProvider>
    </SettingsProvider>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <RootContent />
        <RepzySplash />
      </ThemeProvider>
    </AuthProvider>
  );
}