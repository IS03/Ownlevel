import type { AppIconName } from '@/design-system';

/** One entry of Cuerpo's floating "+". */
export type BodyAddAction = { key: string; label: string; icon: AppIconName; onPress: () => void };
export type BodyAddMenuProps = { actions: BodyAddAction[]; disabled?: boolean };
