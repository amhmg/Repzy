import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useRepzyColors } from '@/constants/repzy-colors';

export default function AppTabs() {
  const c = useRepzyColors();

  return (
    <NativeTabs
      backgroundColor={c.background}
      indicatorColor={c.accentSoft}
      labelStyle={{ default: { color: c.subtext }, selected: { color: c.accent } }}
      iconColor={{ default: c.subtext, selected: c.accent }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/home.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="workouts">
        <NativeTabs.Trigger.Label>Workouts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/workouts.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="coach">
        <NativeTabs.Trigger.Label>Coach</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/coach.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="progress">
        <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/progress.png')} renderingMode="template" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="groups">
        <NativeTabs.Trigger.Label>Groups</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon src={require('@/assets/images/tabIcons/groups.png')} renderingMode="template" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
