import { memo } from 'react';
import { StyleSheet, useColorScheme, View } from 'react-native';
import Body, { ExtendedBodyPart } from 'react-native-body-highlighter';

import { useRepzyColors } from '@/constants/repzy-colors';

type Props = {
  primary: string[];
  secondary: string[];
  height?: number;
  side?: 'both' | 'front' | 'back';
};

// Small front + back body with the worked muscles highlighted
function MuscleMap({ primary, secondary, height = 60, side = 'both' }: Props) {
  const c = useRepzyColors();
  const dark = useColorScheme() === 'dark';

  const data = [
    ...secondary.map((slug) => ({ slug, color: dark ? '#9C4A28' : '#FFB08F' })),
    ...primary.map((slug) => ({ slug, color: c.accent })),
  ] as ExtendedBodyPart[];

  const scale = height / 400; // the diagram is 400 tall at scale 1
  const bodyProps = {
    data,
    scale,
    border: 'none',
    defaultFill: dark ? '#3A3A3A' : '#D6D6D6',
  };

  return (
    <View style={styles.row}>
      {side !== 'back' && <Body {...bodyProps} side="front" />}
      {side !== 'front' && <Body {...bodyProps} side="back" />}
    </View>
  );
}

export default memo(MuscleMap);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});