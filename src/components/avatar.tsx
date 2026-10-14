import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { useRepzyColors } from '@/constants/repzy-colors';

// Profile pictures: a photo you uploaded, one of the drawn avatars below, or your initials.
// Stored in profiles.avatar_url as either a URL or "preset:<id>".

type Hair =
  | 'short'
  | 'buzz'
  | 'spiky'
  | 'curly'
  | 'afro'
  | 'bald'
  | 'long'
  | 'bob'
  | 'bun'
  | 'ponytail'
  | 'hijab';

export type AvatarPreset = {
  id: string;
  skin: string;
  hair: Hair;
  hairColor: string;
  beard?: 'stubble' | 'full';
  glasses?: boolean;
  shirt: string;
  bg: string;
};

const SKIN = ['#F9D7C3', '#EEC1A2', '#D9A27E', '#B97850', '#8D5524', '#5C3A21'];
const HAIR = {
  black: '#1F1A17',
  dark: '#4A2E1F',
  brown: '#7A4B2A',
  blonde: '#D9B26F',
  red: '#A0432A',
  grey: '#B9B9B9',
};

export const AVATAR_PRESETS: AvatarPreset[] = [
  // men
  { id: 'm1', skin: SKIN[1], hair: 'short', hairColor: HAIR.dark, shirt: '#FF5A1F', bg: '#FFE6DC' },
  { id: 'm2', skin: SKIN[4], hair: 'buzz', hairColor: HAIR.black, beard: 'full', shirt: '#2D6CDF', bg: '#DCE8FF' },
  { id: 'm3', skin: SKIN[2], hair: 'spiky', hairColor: HAIR.black, shirt: '#1E8E3E', bg: '#DDF3E4' },
  { id: 'm4', skin: SKIN[0], hair: 'short', hairColor: HAIR.blonde, beard: 'stubble', shirt: '#6B4EFF', bg: '#E9E3FF' },
  { id: 'm5', skin: SKIN[5], hair: 'afro', hairColor: HAIR.black, shirt: '#F5B301', bg: '#FFF3CC' },
  { id: 'm6', skin: SKIN[3], hair: 'bald', hairColor: HAIR.black, beard: 'full', glasses: true, shirt: '#222222', bg: '#E6E6E6' },
  { id: 'm7', skin: SKIN[1], hair: 'curly', hairColor: HAIR.red, shirt: '#0E9AA7', bg: '#D6F4F6' },
  { id: 'm8', skin: SKIN[2], hair: 'short', hairColor: HAIR.grey, beard: 'full', shirt: '#8E44AD', bg: '#F0E1F7' },
  { id: 'm9', skin: SKIN[4], hair: 'curly', hairColor: HAIR.black, glasses: true, shirt: '#D93025', bg: '#FDE0DE' },
  { id: 'm10', skin: SKIN[0], hair: 'buzz', hairColor: HAIR.brown, shirt: '#3A3A3A', bg: '#FFE6DC' },
  { id: 'm11', skin: SKIN[3], hair: 'spiky', hairColor: HAIR.dark, beard: 'stubble', shirt: '#FF5A1F', bg: '#DCE8FF' },
  { id: 'm12', skin: SKIN[5], hair: 'bald', hairColor: HAIR.black, shirt: '#1E8E3E', bg: '#FFF3CC' },
  // women
  { id: 'w1', skin: SKIN[1], hair: 'long', hairColor: HAIR.dark, shirt: '#FF5A1F', bg: '#FFE6DC' },
  { id: 'w2', skin: SKIN[4], hair: 'afro', hairColor: HAIR.black, shirt: '#F5B301', bg: '#DCE8FF' },
  { id: 'w3', skin: SKIN[2], hair: 'hijab', hairColor: '#2D6CDF', shirt: '#2D6CDF', bg: '#DCE8FF' },
  { id: 'w4', skin: SKIN[0], hair: 'ponytail', hairColor: HAIR.blonde, shirt: '#E84393', bg: '#FCE1EE' },
  { id: 'w5', skin: SKIN[5], hair: 'bun', hairColor: HAIR.black, shirt: '#1E8E3E', bg: '#DDF3E4' },
  { id: 'w6', skin: SKIN[3], hair: 'bob', hairColor: HAIR.dark, glasses: true, shirt: '#6B4EFF', bg: '#E9E3FF' },
  { id: 'w7', skin: SKIN[1], hair: 'long', hairColor: HAIR.red, shirt: '#0E9AA7', bg: '#D6F4F6' },
  { id: 'w8', skin: SKIN[4], hair: 'hijab', hairColor: '#222222', shirt: '#222222', bg: '#E6E6E6' },
  { id: 'w9', skin: SKIN[2], hair: 'curly', hairColor: HAIR.brown, shirt: '#D93025', bg: '#FDE0DE' },
  { id: 'w10', skin: SKIN[0], hair: 'bob', hairColor: HAIR.grey, glasses: true, shirt: '#8E44AD', bg: '#F0E1F7' },
  { id: 'w11', skin: SKIN[3], hair: 'ponytail', hairColor: HAIR.black, shirt: '#FF5A1F', bg: '#FFF3CC' },
  { id: 'w12', skin: SKIN[1], hair: 'hijab', hairColor: '#8E44AD', glasses: true, shirt: '#8E44AD', bg: '#F0E1F7' },
];

export function presetById(id: string) {
  return AVATAR_PRESETS.find((p) => p.id === id) ?? null;
}

function shade(hex: string, amount: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
  const r = ch(n >> 16);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Hair drawn behind the head
function HairBack({ p }: { p: AvatarPreset }) {
  const c = p.hairColor;
  switch (p.hair) {
    case 'long':
      return <Path d="M29 45 Q28 21 50 20 Q72 21 71 45 L74 80 Q63 84 58 70 L42 70 Q37 84 26 80 Z" fill={c} />;
    case 'bob':
      return <Path d="M28 46 Q28 21 50 20 Q72 21 72 46 L73 65 Q66 68 62 61 L38 61 Q34 68 27 65 Z" fill={c} />;
    case 'afro':
      return <Circle cx={50} cy={38} r={27} fill={c} />;
    case 'bun':
      return <Circle cx={50} cy={18} r={8.5} fill={c} />;
    case 'ponytail':
      return <Path d="M63 30 Q82 36 77 68 Q72 58 66 46 Z" fill={c} />;
    case 'hijab':
      return <Path d="M22 100 L23 52 Q22 16 50 16 Q78 16 77 52 L78 100 Z" fill={c} />;
    default:
      return null;
  }
}

// Hair drawn over the head
function HairFront({ p }: { p: AvatarPreset }) {
  const c = p.hairColor;
  switch (p.hair) {
    case 'short':
      return <Path d="M31 46 Q30 23 50 22 Q70 23 69 46 Q66 33 58 31 Q48 35 38 32 Q33 37 31 46 Z" fill={c} />;
    case 'buzz':
      return <Path d="M32 41 Q32 25 50 25 Q68 25 68 41 Q62 31 50 31 Q38 31 32 41 Z" fill={c} />;
    case 'spiky':
      return (
        <Path d="M31 44 L32 30 L37 33 L40 22 L45 29 L50 19 L55 29 L60 22 L63 33 L68 30 L69 44 Q60 32 50 32 Q40 32 31 44 Z" fill={c} />
      );
    case 'curly':
      return (
        <G fill={c}>
          {[
            [33, 40],
            [35, 32],
            [41, 26],
            [48, 23],
            [55, 23],
            [61, 26],
            [66, 32],
            [67, 40],
            [44, 29],
            [55, 29],
          ].map(([x, y], i) => (
            <Circle key={i} cx={x} cy={y} r={6} />
          ))}
        </G>
      );
    case 'afro':
      return <Path d="M31 42 Q34 28 50 28 Q66 28 69 42 Q62 34 50 34 Q38 34 31 42 Z" fill={c} />;
    case 'long':
    case 'bob':
      return <Path d="M31 47 Q29 22 50 21 Q71 22 69 47 Q64 30 47 31 Q37 34 31 47 Z" fill={c} />;
    case 'bun':
    case 'ponytail':
      return <Path d="M31 44 Q31 23 50 23 Q69 23 69 44 Q64 30 50 30 Q36 30 31 44 Z" fill={c} />;
    case 'hijab':
      return <Path d="M31 44 Q33 26 50 26 Q67 26 69 44 Q66 30 50 30 Q34 30 31 44 Z" fill={shade(c, -0.25)} />;
    default:
      return null;
  }
}

export function PresetAvatar({ preset: p, size }: { preset: AvatarPreset; size: number }) {
  const hijab = p.hair === 'hijab';
  // eyebrows follow the hair colour (a dark brown under a hijab, a softer grey for grey hair)
  const brow = hijab ? HAIR.dark : p.hairColor === HAIR.grey ? '#808080' : p.hairColor;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: p.bg }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* shoulders */}
        <Path d="M14 100 Q14 77 50 75 Q86 77 86 100 Z" fill={p.shirt} />
        {!hijab && <Rect x={42} y={60} width={16} height={17} rx={6} fill={shade(p.skin, -0.12)} />}
        <HairBack p={p} />
        {!hijab && (
          <>
            <Circle cx={31} cy={49} r={4.2} fill={shade(p.skin, -0.06)} />
            <Circle cx={69} cy={49} r={4.2} fill={shade(p.skin, -0.06)} />
          </>
        )}
        <Ellipse cx={50} cy={47} rx={hijab ? 17 : 19} ry={hijab ? 20 : 22} fill={p.skin} />
        {p.beard === 'full' && (
          <Path d="M31 49 Q31 73 50 75 Q69 73 69 49 Q66 62 58 62 Q50 60 42 62 Q34 62 31 49 Z" fill={p.hairColor} />
        )}
        {p.beard === 'stubble' && (
          <Path
            d="M31 49 Q31 73 50 75 Q69 73 69 49 Q66 62 58 62 Q50 60 42 62 Q34 62 31 49 Z"
            fill={p.hairColor}
            opacity={0.35}
          />
        )}
        {/* face */}
        <Path d="M39 42 Q43 40 46 42" stroke={brow} strokeWidth={1.8} strokeLinecap="round" fill="none" />
        <Path d="M54 42 Q57 40 61 42" stroke={brow} strokeWidth={1.8} strokeLinecap="round" fill="none" />
        <Circle cx={43} cy={48} r={2.3} fill="#2B2B2B" />
        <Circle cx={57} cy={48} r={2.3} fill="#2B2B2B" />
        <Circle cx={36} cy={55} r={3} fill="#FF7B7B" opacity={0.25} />
        <Circle cx={64} cy={55} r={3} fill="#FF7B7B" opacity={0.25} />
        <Path
          d="M44 57 Q50 63 56 57"
          stroke={p.beard === 'full' ? '#F4E6DA' : shade(p.skin, -0.5)}
          strokeWidth={2}
          strokeLinecap="round"
          fill="none"
        />
        {p.glasses && (
          <G stroke="#222222" strokeWidth={1.6} fill="none">
            <Rect x={37} y={43.5} width={11} height={9} rx={3.5} />
            <Rect x={52} y={43.5} width={11} height={9} rx={3.5} />
            <Path d="M48 47 L52 47" />
          </G>
        )}
        <HairFront p={p} />
      </Svg>
    </View>
  );
}

function initialsOf(name: string) {
  const parts = name.split(/[\s_]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

// Shows whatever picture the person chose, falling back to their initials
export default function Avatar({ url, name, size }: { url: string | null | undefined; name: string; size: number }) {
  const c = useRepzyColors();

  if (url?.startsWith('preset:')) {
    const preset = presetById(url.slice(7));
    if (preset) return <PresetAvatar preset={preset} size={size} />;
  }
  if (url?.startsWith('https://')) {
    return (
      <Image
        source={{ uri: url }}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.inputBg }}
        contentFit="cover"
        transition={150}
        accessibilityIgnoresInvertColors
      />
    );
  }
  return (
    <View style={[styles.initials, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent }]}>
      <Text style={[styles.initialsText, { fontSize: size * 0.38 }]}>{initialsOf(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { alignItems: 'center', justifyContent: 'center' },
  initialsText: { color: '#FFFFFF', fontWeight: '900' },
});
