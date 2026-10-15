import type { SFSymbol } from 'expo-symbols';

// Semantic icon names used by the app. Screens only use these via <AppIcon>;
// the platform implementation (SF Symbols on iOS, Lucide on Android) lives in
// icons.tsx / icons.android.tsx (IDENTIDAD.md § Íconos).
export type AppIconName =
  | 'reorder'
  | 'dragHandle'
  | 'archive'
  | 'bookmark'
  | 'chat'
  | 'edit'
  | 'repeat'
  | 'sparkles'
  | 'playFilled'
  | 'info'
  | 'activity'
  | 'brand'
  | 'book'
  | 'calendar'
  | 'check'
  | 'checkmark'
  | 'chevronDown'
  | 'chevronLeft'
  | 'chevronRight'
  | 'clock'
  | 'close'
  | 'dumbbell'
  | 'flame'
  | 'search'
  | 'filter'
  | 'footprints'
  | 'more'
  | 'moon'
  | 'mug'
  | 'nutrition'
  | 'note'
  | 'plus'
  | 'play'
  | 'profile'
  | 'progress'
  | 'refresh'
  | 'routines'
  | 'scale'
  | 'settings'
  | 'trophy'
  | 'trash'
  | 'warning'
  | 'water';

export type AppIconProps = {
  accessibilityLabel?: string;
  color: string;
  name: AppIconName;
  size?: number;
};

/** IDENTIDAD.md § Íconos (not part of tokens.ts): tab bar 24, rows and buttons 20, next to Body text 17. */
export const appIconSize = { tabBar: 24, row: 20, inline: 17 } as const;

export const sfSymbolNames: Record<AppIconName, SFSymbol> = {
  reorder: 'arrow.up.arrow.down',
  dragHandle: 'line.3.horizontal',
  archive: 'archivebox',
  bookmark: 'bookmark',
  chat: 'bubble.left',
  edit: 'pencil',
  repeat: 'arrow.2.squarepath',
  sparkles: 'sparkles',
  playFilled: 'play.fill',
  info: 'info.circle',
  activity: 'bolt.fill',
  // Temporary until the brand isotype replaces it (M9.1D).
  brand: 'figure.strengthtraining.traditional',
  book: 'book',
  calendar: 'calendar',
  check: 'checkmark.circle.fill',
  checkmark: 'checkmark',
  chevronDown: 'chevron.down',
  chevronLeft: 'chevron.left',
  chevronRight: 'chevron.right',
  clock: 'clock.fill',
  close: 'xmark',
  dumbbell: 'dumbbell.fill',
  flame: 'flame.fill',
  search: 'magnifyingglass',
  filter: 'line.3.horizontal.decrease',
  footprints: 'figure.walk',
  more: 'ellipsis',
  moon: 'moon.fill',
  mug: 'cup.and.saucer.fill',
  nutrition: 'fork.knife',
  note: 'note.text',
  plus: 'plus',
  play: 'play',
  profile: 'person.fill',
  progress: 'chart.line.uptrend.xyaxis',
  refresh: 'arrow.clockwise',
  routines: 'list.bullet.rectangle',
  scale: 'scalemass.fill',
  settings: 'gearshape.fill',
  trophy: 'trophy.fill',
  trash: 'trash',
  warning: 'exclamationmark.triangle.fill',
  water: 'drop.fill',
};
