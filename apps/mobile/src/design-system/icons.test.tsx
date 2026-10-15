import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { lucideIcons, LUCIDE_STROKE_WIDTH } from './icon-lucide';
// Both platform implementations on purpose (the import resolver maps './icons' per platform).
// eslint-disable-next-line import/no-duplicates
import { AppIcon as IosAppIcon } from './icons';
// eslint-disable-next-line import/no-duplicates
import { AppIcon as AndroidAppIcon } from './icons.android';
import { appIconSize, sfSymbolNames, type AppIconName } from './icon-names';

const mockSymbol = jest.fn((_props: Record<string, unknown>) => null);
jest.mock('expo-symbols', () => ({ SymbolView: (props: Record<string, unknown>) => mockSymbol(props) }));

const names = Object.keys(sfSymbolNames) as AppIconName[];

describe('AppIcon foundation', () => {
  it('every semantic name has an SF Symbol (iOS) and a Lucide icon (Android): no fallback needed', () => {
    expect(names).toHaveLength(49);
    expect(sfSymbolNames.archive).toBe('archivebox');
    expect(sfSymbolNames.playFilled).toBe('play.fill');
    expect(Object.keys(lucideIcons).sort()).toEqual([...names].sort());
    for (const name of names) {
      expect(typeof sfSymbolNames[name]).toBe('string');
      expect(lucideIcons[name]).toBeTruthy();
    }
  });

  it('iOS renders the native SF Symbol with the requested size and tint', () => {
    render(<IosAppIcon color="#7D6A3C" name="nutrition" size={appIconSize.row} />);
    expect(mockSymbol).toHaveBeenCalledWith(expect.objectContaining({ name: 'fork.knife', size: 20, tintColor: '#7D6A3C' }));
  });

  it('Android renders Lucide with stroke 2, size and color', () => {
    const view = render(<AndroidAppIcon accessibilityLabel="Ajustes" color="#C9B68A" name="settings" size={appIconSize.tabBar} />);
    const icon = view.UNSAFE_getByType(lucideIcons.settings);
    expect(icon.props).toMatchObject({ color: '#C9B68A', size: 24, strokeWidth: LUCIDE_STROKE_WIDTH });
    expect(LUCIDE_STROKE_WIDTH).toBe(2);
    expect(view.getByLabelText('Ajustes')).toBeTruthy();
    expect(mockSymbol).not.toHaveBeenCalled();
  });

  it('brand icon sizes are available to consumers', () => {
    expect(appIconSize).toEqual({ tabBar: 24, row: 20, inline: 17 });
  });
});
