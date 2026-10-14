import type { AppIconName } from '@/design-system';

const icons: Record<string, AppIconName> = { mate: 'mug', sleep: 'moon', steps: 'footprints', water: 'water' };

export const homeMetricIcon = (systemKey: string | null): AppIconName => systemKey ? icons[systemKey] ?? 'activity' : 'activity';
