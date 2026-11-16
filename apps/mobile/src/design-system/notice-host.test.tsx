import { useState } from 'react';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { NoticeHost, NoticeOutlet, OwnlevelThemeProvider, TransientNotice } from '@/design-system';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

const tree = (children: React.ReactNode) => <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>
  <OwnlevelThemeProvider initialMode="light">{children}</OwnlevelThemeProvider>
</SafeAreaProvider>;

/** A screen that raises a notice with an Undo bound to its own state, as Inicio and Nutrición do. */
function Screen({ name, testID }: { name: string; testID: string }) {
  const [count, setCount] = useState(1), [shown, setShown] = useState(true);
  return <View testID={testID}>
    <Text>{name}: {count}</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Sumar ${name}`} onPress={() => setCount(value => value + 1)} />
    <NoticeOutlet placement="tab">
      {shown ? <TransientNotice testID={`${testID}-notice`} message={`${name}: ${count}`} state="done"
        action={{ label: 'Deshacer', accessibilityLabel: `Deshacer ${name}`, onPress: () => setCount(value => value - 1) }} onDismiss={() => setShown(false)} /> : null}
    </NoticeOutlet>
  </View>;
}

describe('NoticeHost (QA: a confirmation outlives the tab it was raised in)', () => {
  it('shows a screen notice in the host above the tabs, not inside the screen, and keeps it current with its owner', () => {
    const view = render(tree(<NoticeHost><Screen name="Agua" testID="home" /></NoticeHost>));
    const host = within(view.getByTestId('notice-host'));
    expect(host.getByText('Agua: 1')).toBeTruthy();
    expect(within(view.getByTestId('home')).queryByTestId('home-notice')).toBeNull();
    // Its Undo acts on the owner's state, and the host shows the owner's latest notice.
    fireEvent.press(view.getByRole('button', { name: 'Sumar Agua' }));
    expect(host.getByText('Agua: 2')).toBeTruthy();
    fireEvent.press(host.getByRole('button', { name: 'Deshacer Agua' }));
    expect(host.getByText('Agua: 1')).toBeTruthy();
    // Dismissing goes to the owner, which drops it from the host.
    fireEvent.press(view.getByTestId('home-notice-body'));
    expect(view.queryByTestId('home-notice')).toBeNull();
  });
  it('stacks the notices of several owners and drops an owner\'s when it unmounts', () => {
    function Tabs() {
      const [nutrition, setNutrition] = useState(true);
      return <NoticeHost>
        <Screen name="Agua" testID="home" />
        {nutrition ? <Screen name="Banana" testID="nutrition" /> : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar Nutrición" onPress={() => setNutrition(false)} />
      </NoticeHost>;
    }
    const view = render(tree(<Tabs />));
    const host = within(view.getByTestId('notice-host'));
    expect(host.getByText('Agua: 1')).toBeTruthy(); expect(host.getByText('Banana: 1')).toBeTruthy();
    act(() => { fireEvent.press(view.getByRole('button', { name: 'Cerrar Nutrición' })); });
    expect(host.queryByText('Banana: 1')).toBeNull(); expect(host.getByText('Agua: 1')).toBeTruthy();
  });
  it('without a host (a screen on its own) the notices stay in place, in the same stack', () => {
    const view = render(tree(<Screen name="Agua" testID="home" />));
    expect(view.queryByTestId('notice-host')).toBeNull();
    expect(within(view.getByTestId('home')).getByTestId('home-notice')).toBeTruthy();
  });
});
