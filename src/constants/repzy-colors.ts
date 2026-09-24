import { useColorScheme } from 'react-native';

export const lightColors = {
  background: '#FFFFFF',
  card: '#F6F6F6',
  text: '#111111',
  subtext: '#6B6B6B',
  inputBg: '#EDEDED',
  border: '#E0E0E0',
  accent: '#FF5A1F',
  accentSoft: '#FFE6DC',
  error: '#D93025',
  success: '#1E8E3E',
  successSoft: '#DDF3E4',
  gold: '#F5B301',
};

export const darkColors = {
  background: '#0E0E0E',
  card: '#171717',
  text: '#F5F5F5',
  subtext: '#9A9A9A',
  inputBg: '#222222',
  border: '#2A2A2A',
  accent: '#FF6B35',
  accentSoft: '#3A1E12',
  error: '#FF6B6B',
  success: '#4CD964',
  successSoft: '#12301B',
  gold: '#FFC83D',
};

export type RepzyColors = typeof lightColors;

export function useRepzyColors(): RepzyColors {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}