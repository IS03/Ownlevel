import type { SFSymbol } from 'expo-symbols';

// Semantic icon names used by the app. Screens only use these via <AppIcon>;
// the platform implementation (SF Symbols on iOS, Lucide on Android) lives in
// icons.tsx / icons.android.tsx (IDENTIDAD.md § Íconos).
export type AppIconName =
  | 'bike' | 'heart' | 'pill' | 'apple' | 'brain' | 'bed' | 'timer' | 'smile' | 'leaf' | 'no-smoking'
  // Metric icons added in #535 (activity, health and everyday habits).
  | 'run' | 'swim' | 'yoga' | 'mountain' | 'heart-pulse' | 'syringe' | 'thermometer' | 'stethoscope' | 'fork-knife' | 'wine'
  | 'pen' | 'music' | 'phone' | 'study' | 'dog' | 'checklist' | 'money'
  | 'reorder'
  | 'dragHandle'
  | 'archive'
  | 'bookmark'
  | 'pin'
  | 'chat'
  | 'compare'
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
  | 'hourglass'
  | 'close'
  | 'dumbbell'
  | 'flame'
  | 'search'
  | 'filter'
  | 'footprints'
  | 'more'
  | 'sunrise'
  | 'sun'
  | 'sunset'
  | 'moon'
  | 'mug'
  | 'nutrition'
  | 'note'
  | 'plus'
  | 'minus'
  | 'play'
  | 'profile'
  | 'progress'
  | 'refresh'
  | 'routines'
  | 'scale'
  | 'ruler'
  | 'settings'
  | 'trophy'
  | 'trash'
  | 'warning'
  | 'water'
  | 'work';

export type AppIconProps = {
  accessibilityLabel?: string;
  color: string;
  name: AppIconName;
  size?: number;
};

/** IDENTIDAD.md § Íconos (not part of tokens.ts): tab bar 24, rows and buttons 20, next to Body text 17. */
export const appIconSize = { tabBar: 24, row: 20, inline: 17 } as const;

export const sfSymbolNames: Record<AppIconName, SFSymbol> = {
  bike: 'bicycle', heart: 'heart', pill: 'pills', apple: 'carrot', brain: 'brain', bed: 'bed.double', timer: 'timer', smile: 'face.smiling', leaf: 'leaf', 'no-smoking': 'nosign',
  run: 'figure.run', swim: 'figure.pool.swim', yoga: 'figure.mind.and.body', mountain: 'mountain.2', 'heart-pulse': 'waveform.path.ecg',
  syringe: 'syringe', thermometer: 'thermometer.medium', stethoscope: 'stethoscope', 'fork-knife': 'fork.knife', wine: 'wineglass',
  pen: 'pencil.line', music: 'music.note', phone: 'iphone', study: 'graduationcap', dog: 'dog', checklist: 'checklist', money: 'banknote',
  reorder: 'arrow.up.arrow.down',
  dragHandle: 'line.3.horizontal',
  archive: 'archivebox',
  bookmark: 'bookmark',
  pin: 'pin',
  chat: 'bubble.left',
  compare: 'arrow.left.arrow.right',
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
  hourglass: 'hourglass',
  close: 'xmark',
  dumbbell: 'dumbbell.fill',
  flame: 'flame.fill',
  search: 'magnifyingglass',
  filter: 'line.3.horizontal.decrease',
  footprints: 'figure.walk',
  more: 'ellipsis',
  sunrise: 'sunrise',
  sun: 'sun.max',
  sunset: 'sunset',
  moon: 'moon.fill',
  mug: 'cup.and.saucer.fill',
  nutrition: 'fork.knife',
  note: 'note.text',
  plus: 'plus',
  minus: 'minus',
  play: 'play',
  profile: 'person.fill',
  progress: 'chart.line.uptrend.xyaxis',
  refresh: 'arrow.clockwise',
  routines: 'list.bullet.rectangle',
  scale: 'scalemass.fill',
  ruler: 'ruler',
  settings: 'gearshape.fill',
  trophy: 'trophy.fill',
  trash: 'trash',
  warning: 'exclamationmark.triangle.fill',
  water: 'drop.fill',
  work: 'briefcase',
};
