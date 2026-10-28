import { act, fireEvent, render } from '@testing-library/react-native';
import { invalidateConfirmedReads } from '@/api/confirmed-read-cache';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import type { MobileApiClient } from '@/api/client';
import type { NutritionStages } from '@/api/nutrition-stages';
import { OwnlevelThemeProvider } from '@/design-system';
import { NutritionConfigurationProvider } from '@/nutrition/config-provider';
import { configFixture } from '@/nutrition/config-fixture.test-helper';
import type { NutritionConfig } from '@/api/nutrition-config';
import { nutritionFixture } from '@/nutrition/day-fixture.test-helper';
import { SettingsScreen } from './settings-screen';
import { AccountScreen } from './account-screen';
import { AppSettingsScreen } from './app-screen';
import { ConfigurationScreen } from './configuration-screen';
import { hapticsPreference, resetHapticsForTests } from '@/platform/haptics';

const mockRead = jest.fn<MobileApiClient['read']>(),
  mockRequest = jest.fn<MobileApiClient['request']>();
let mockClient = { read: mockRead, request: mockRequest };
const mockPush = jest.fn(),
  mockReplace = jest.fn(),
  mockSignOut = jest.fn(async () => undefined);
let mockUser = 'owner';
let mockProvider: string | undefined = 'google';
jest.mock('@/api', () => ({ useMobileApi: () => ({ client: mockClient }) }));
jest.mock('@/auth', () => ({
  useMobileAuth: () => ({
    session: {
      user: {
        id: mockUser,
        email: 'nacho@example.com',
        app_metadata: { provider: mockProvider },
        user_metadata: {},
      },
    },
    state: { status: 'SIGNED_IN' },
    signOut: mockSignOut,
  }),
}));
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useNavigation: () => ({ dispatch: jest.fn() }),
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    const React = jest.requireActual<typeof import('react')>('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: () => {},
  useIsFocused: () => true,
}));
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.2.0',
  nativeBuildVersion: '42',
}));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@/settings/native-segmented', () => ({
  SettingsSegmented: (props: import('./native-segmented').SettingsSegmentedProps<string>) => {
    const { SegmentedControl } =
      jest.requireActual<typeof import('@/design-system')>('@/design-system');
    return <SegmentedControl {...props} />;
  },
}));
jest.mock('@/settings/physical-controls', () => ({
  BirthPicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
    return (
      <TextInput accessibilityLabel="Nacimiento nativo" value={value} onChangeText={onChange} />
    );
  },
  HeightWheel: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => {
    const { TextInput } = jest.requireActual<typeof import('react-native')>('react-native');
    return <TextInput accessibilityLabel="Altura nativa" value={value} onChangeText={onChange} />;
  },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
const version = 'a'.repeat(64);
const meta = { durationMs: 1, httpStatus: 200, outcome: 'ok' as const };
const ok = <T,>(data: T) => ({ status: 'ok' as const, data, meta });
const unavailable = {
  status: 'unavailable' as const,
  reason: 'network' as const,
  meta: { ...meta, outcome: 'unavailable' as const },
};
let config: NutritionConfig, list: NutritionStages, displayName: string, stagesFail: boolean;
const element = (screen: React.ReactNode = <SettingsScreen />) => (
  <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 0, left: 0, right: 0 }}>
    <OwnlevelThemeProvider initialMode="light">
      <NutritionConfigurationProvider>{screen}</NutritionConfigurationProvider>
    </OwnlevelThemeProvider>
  </SafeAreaInsetsContext.Provider>
);
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  resetHapticsForTests();
  mockUser = 'owner';
  mockProvider = 'google';
  mockClient = { read: mockRead, request: mockRequest };
  config = structuredClone(configFixture);
  displayName = 'Nacho';
  stagesFail = false;
  list = {
    today: '2026-10-16',
    listVersion: 1,
    current: null,
    upcoming: [],
    past: [],
    sequences: [],
    suggestions: null,
  };
  mockRead.mockImplementation(async (options) => {
    if (options.path === '/api/mobile/v1/profile') return ok({ displayName, version }) as never;
    if (options.path === '/api/mobile/v1/nutrition/stages?targets=2')
      return (stagesFail ? unavailable : ok(list)) as never;
    if (options.path === '/api/mobile/v1/metrics/definitions?presentation=1')
      return ok({ definitions: [] }) as never;
    if (options.path.includes('/nutrition/days/'))
      return ok(nutritionFixture(config.today)) as never;
    return ok(config) as never;
  });
});
function currentStage(endsOn: string | null, kind: 'deficit' | 'maintenance' = 'deficit') {
  list.current = {
    id: 'stage',
    name: 'Mi etapa',
    kind,
    startsOn: '2026-09-29',
    endsOn,
    sequenceId: null,
    position: null,
    duration: null,
    status: 'current',
    baseWaterL: 2,
    trainingWaterDeltaL: 0,
    trainingCalorieDeltaKcal: 0,
    trainingProteinDeltaG: 0,
    weekdays: Array.from({ length: 7 }, (_, i) => ({
      weekday: i + 1,
      calorieTargetKcal: 1900,
      proteinTargetG: 120,
    })),
  };
}
describe('Editorial settings', () => {
  it('the header is only your name and photo: no stage sentence, dates or progress (the Plan row has the plan)', async () => {
    for (const end of ['2026-12-22', null]) {
      currentStage(end);
      const view = render(element());
      await view.findByText('Nacho');
      expect(view.queryByText(/semana|rige desde/)).toBeNull();
      expect(view.queryByLabelText('Avance de tu etapa')).toBeNull();
      expect(view.queryByText(/^Termina /)).toBeNull();
      expect(view.getAllByLabelText('Cuenta').length).toBeGreaterThan(0); // the photo and the Cuenta row
      view.unmount();
    }
  });
  it.each([false, true])(
    'neutral headline with no plan or unavailable stages (failure=%s)',
    async (fail) => {
      stagesFail = fail;
      const view = render(element());
      await view.findByText('Nacho');
      expect(view.queryByText(/No pudimos/)).toBeNull();
      fireEvent.press(view.getByLabelText('Energía'));
      expect(mockPush).toHaveBeenCalledWith('/settings/energy');
    },
  );
  it('routes every row; Plan opens stages and version opens diagnostics', async () => {
    const view = render(element());
    await view.findByText('Nacho');
    for (const [label, path] of [
      ['Datos físicos', '/settings/physical'],
      ['Métricas', '/settings/metrics'],
      ['App', '/settings/app'],
    ] as const) {
      fireEvent.press(view.getByLabelText(label));
      expect(mockPush).toHaveBeenCalledWith(path);
    }
    fireEvent.press(view.getByText('OWNLEVEL 1.2.0 (42)'));
    expect(mockPush).toHaveBeenCalledWith('/settings/diagnostics');
    fireEvent.press(view.getByLabelText('Plan'));
    expect(mockPush).toHaveBeenCalledWith('/settings/stages');
    expect(view.queryByText(/V2|heredada|borrador/)).toBeNull();
  });
  it('the refresh indicator stays out of the flow: rows keep their place when it appears and goes (#311)', async () => {
    const view = render(element()); await view.findByText('Nacho');
    view.unmount();
    // A later visit outside the reuse window refreshes with the known name on screen.
    const start = Date.now(); jest.spyOn(Date, 'now').mockReturnValue(start + 31_000);
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = mockRead.getMockImplementation()!;
    mockRead.mockImplementation(async options => { await gate; return original(options); });
    const again = render(element());
    expect(again.getByText('Nacho')).toBeTruthy();
    const indicator = again.getByTestId('settings-refreshing');
    expect(StyleSheet.flatten(indicator.props.style)).toMatchObject({ position: 'absolute', top: '100%' });
    await act(async () => { release(); });
    jest.mocked(Date.now).mockRestore();
  });
  it('shows cached headline immediately on reentry and no other user data', async () => {
    const view = render(element());
    await view.findByText('Nacho');
    view.unmount();
    mockRead.mockImplementation(() => new Promise(() => {}));
    const cached = render(element());
    expect(cached.getByText('Nacho')).toBeTruthy();
    cached.unmount();
    mockUser = 'other';
    const other = render(element());
    expect(other.queryByText('Nacho')).toBeNull();
  });
  it('re-entering inside the reuse window reads nothing again; a settled write or an expired window does', async () => {
    const identityReads = () => mockRead.mock.calls.filter(([options]) => options.path === '/api/mobile/v1/profile').length;
    const view = render(element()); await view.findByText('Nacho'); view.unmount();
    expect(identityReads()).toBe(1);
    const again = render(element()); await again.findByText('Nacho'); again.unmount();
    expect(identityReads()).toBe(1);
    invalidateConfirmedReads(mockClient as never, '/api/mobile/v1/profile');
    const written = render(element()); await act(async () => {}); written.unmount();
    expect(identityReads()).toBe(2);
    const start = Date.now(); jest.spyOn(Date, 'now').mockReturnValue(start + 31_000);
    const later = render(element()); await act(async () => {}); later.unmount();
    expect(identityReads()).toBe(3);
    jest.mocked(Date.now).mockRestore();
  });
  it('failed stage refresh replaces cached stage with neutral headline', async () => {
    currentStage('2026-12-22');
    const view = render(element());
    await view.findByText('Nacho');
    view.unmount();
    stagesFail = true;
    const refreshed = render(element());
    await refreshed.findByText('Nacho');
    expect(refreshed.queryByText(/semana/)).toBeNull();
  });
});
describe('Account and local App preferences', () => {
  it('uses neutral copy when the connected provider is not known', async () => {
    mockProvider = undefined;
    const view = render(element(<AccountScreen />));
    await view.findByLabelText('Editar nombre');
    // No provider line and no "Entrás con…" row: name, email and the two account actions only.
    expect(view.queryByText('Tu cuenta conectada')).toBeNull();
    expect(view.queryByText(/^Entrás con/)).toBeNull();
  });
  it('edits in place through the existing name controller with CAS and confirmed truth', async () => {
    mockRequest.mockImplementationOnce(async () => {
      displayName = 'Ignacio';
      return ok({
        status: 'confirmed',
        displayName,
        version: 'b'.repeat(64),
      }) as never;
    });
    const view = render(element(<AccountScreen />));
    fireEvent.press(await view.findByLabelText('Editar nombre'));
    fireEvent.changeText(view.getByLabelText('Cómo querés que te llamemos'), ' Ignacio ');
    await act(async () => fireEvent.press(view.getByLabelText('Guardar nombre')));
    await view.findByText('Ignacio');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/mobile/v1/profile',
        body: expect.objectContaining({
          displayName: 'Ignacio',
          expectedVersion: version,
        }),
      }),
    );
    expect(view.getByText('Nombre guardado.')).toBeTruthy();
  });
  it('presents name conflict in plain language, keeps draft and requires explicit review', async () => {
    mockRequest.mockImplementationOnce(async () => {
      displayName = 'Desde Web';
      return {
        status: 'conflict',
        code: 'PROFILE_CHANGED',
        message: 'Cambió',
        meta,
      } as never;
    });
    const view = render(element(<AccountScreen />));
    fireEvent.press(await view.findByLabelText('Editar nombre'));
    fireEvent.changeText(view.getByLabelText('Cómo querés que te llamemos'), 'Mobile');
    await act(async () => fireEvent.press(view.getByLabelText('Guardar nombre')));
    await view.findByText('Cambiaste el nombre en otro lado. Quedó «Desde Web».');
    expect(view.getByLabelText('Cómo querés que te llamemos').props.value).toBe('Mobile');
    fireEvent.press(view.getByText('Volver a escribirlo'));
    expect(view.getByLabelText('Guardar nombre')).toBeTruthy();
  });
  it('signs out only after native confirmation', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const view = render(element(<AccountScreen />));
    await view.findByLabelText('Editar nombre');
    fireEvent.press(view.getByLabelText('Cerrar sesión'));
    expect(mockSignOut).not.toHaveBeenCalled();
    await act(async () =>
      alert.mock.calls
        .at(-1)?.[2]
        ?.find((b) => b.text === 'Cerrar sesión')
        ?.onPress?.(),
    );
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });
  it('theme and vibration stay device-local and never write to the API', async () => {
    const view = render(element(<AppSettingsScreen />));
    fireEvent.press(view.getByText('Oscuro'));
    await act(async () => fireEvent(view.getByLabelText('Vibración'), 'valueChange', false));
    expect(hapticsPreference().enabled).toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
describe('Routed configuration shares the durable controller', () => {
  it('activity is human-readable, estimates with engine factors and saves the same energy intent', async () => {
    mockRequest.mockImplementationOnce(
      async () =>
        ok({
          status: 'confirmed',
          operation: 'energy',
          date: config.today,
          version,
          weightRecorded: false,
        }) as never,
    );
    const view = render(element(<ConfigurationScreen operation="energy" />));
    fireEvent.press(await view.findByLabelText('Mucho movimiento'));
    await view.findByText('2.430');
    await act(async () => fireEvent.press(view.getByText('Guardar cambios')));
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'PATCH',
        path: '/api/mobile/v1/nutrition/config',
        body: expect.objectContaining({
          operation: 'energy',
          expectedVersion: version,
          fields: expect.objectContaining({
            activityLevel: 'high',
            baseExpenditureMode: 'automatic',
          }),
        }),
      }),
    );
    expect(view.getByText('Cambios guardados.')).toBeTruthy();
    expect(view.queryByText(/moderate|high|BMR/)).toBeNull();
  });
  it('sex without data has no selected option, and a first weight uses the same physical intent', async () => {
    if (config.physical.status === 'ok')
      config.physical.data = {
        ...config.physical.data,
        sex: null,
        weightKg: null,
        hasWeightHistory: false,
        latestWeightDate: null,
      };
    mockRequest.mockImplementationOnce(
      async () =>
        ok({
          status: 'confirmed',
          operation: 'physical',
          date: config.today,
          version,
          weightRecorded: true,
        }) as never,
    );
    const view = render(element(<ConfigurationScreen operation="physical" />));
    fireEvent.press(await view.findByLabelText('Sexo'));
    for (const word of ['Hombre', 'Mujer', 'Otro'])
      expect(view.getByLabelText(word).props.accessibilityState.checked).toBe(false);
    fireEvent.changeText(view.getByLabelText('Peso (kg)'), '81,25');
    await act(async () => fireEvent.press(view.getByText('Guardar cambios')));
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/mobile/v1/profile/physical',
        body: expect.objectContaining({
          operation: 'physical',
          expectedVersion: version,
          fields: expect.objectContaining({ sex: null, weightKg: 81.25 }),
        }),
      }),
    );
  });
  it('a weight with history is readonly here and links to Body', async () => {
    const view = render(element(<ConfigurationScreen operation="physical" />));
    await view.findByLabelText('Peso');
    expect(view.queryByLabelText('Peso (kg)')).toBeNull();
    expect(view.getByText('Último registro: 4 oct · Se cambia en Cuerpo')).toBeTruthy();
    fireEvent.press(view.getByLabelText('Peso'));
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/progress/body');
  });
  it('missing energy is not rendered as zero', async () => {
    if (config.energy.status === 'ok')
      config.energy.data = {
        ...config.energy.data,
        bmrKcal: null,
        automaticBaseKcal: null,
        usedBaseKcal: null,
      };
    const view = render(element(<ConfigurationScreen operation="energy" />));
    await view.findByText('Para calcularlo necesitamos tu altura, peso y nacimiento.');
    expect(view.queryByText('0 kcal')).toBeNull();
  });
  it('native physical controls write into the existing draft, not a separate backend path', async () => {
    const view = render(element(<ConfigurationScreen operation="physical" />));
    fireEvent.press(await view.findByLabelText('Altura'));
    fireEvent.changeText(view.getByLabelText('Altura nativa'), '181');
    fireEvent.press(view.getByLabelText('Nacimiento'));
    fireEvent.changeText(view.getByLabelText('Nacimiento nativo'), '1991-02-03');
    expect(mockRequest).not.toHaveBeenCalled();
    expect(view.getByText('181 cm')).toBeTruthy();
  });
  it('keeps the energy draft on conflict, shows server truth, and rebases only explicitly', async () => {
    mockRequest.mockImplementationOnce(async () => {
      if (config.energy.status === 'ok')
        config.energy.data = {
          ...config.energy.data,
          activityLevel: 'low',
          usedBaseKcal: 2160,
          version: 'b'.repeat(64),
        };
      return {
        status: 'conflict',
        code: 'CONFIG_CHANGED',
        message: 'Cambió',
        meta,
      } as never;
    });
    const view = render(element(<ConfigurationScreen operation="energy" />));
    fireEvent.press(await view.findByLabelText('Mucho movimiento'));
    await act(async () => fireEvent.press(view.getByText('Guardar cambios')));
    await view.findByText(
      'Estos datos cambiaron en otro lado. Revisá cómo quedaron antes de guardar.',
    );
    expect(view.getByText(/Ahora: Poco movimiento · 2.160 kcal por día/)).toBeTruthy();
    expect(view.getByLabelText('Mucho movimiento').props.accessibilityState.checked).toBe(true);
    expect(mockRequest).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByText('Revisar mi cambio'));
    mockRequest.mockResolvedValueOnce(
      ok({
        status: 'confirmed',
        operation: 'energy',
        date: config.today,
        version,
        weightRecorded: false,
      }) as never,
    );
    await act(async () => fireEvent.press(view.getByText('Guardar cambios')));
    expect(mockRequest.mock.calls[1][0].body).toMatchObject({
      expectedVersion: 'b'.repeat(64),
      fields: { activityLevel: 'high' },
    });
  });
  it('Manual: the number is the field and the day-to-day choice is not offered (it only feeds the automatic estimate)', async () => {
    if (config.energy.status === 'ok') config.energy.data = { ...config.energy.data, baseExpenditureMode: 'custom', customBaseExpenditureKcal: 2300, usedBaseKcal: 2300 };
    const view = render(element(<ConfigurationScreen operation="energy" />));
    expect((await view.findByLabelText('Tu gasto por día (kcal)')).props.value).toBe('2300');
    expect(view.getByText('Manual')).toBeTruthy();
    expect(view.queryByText('La pongo yo')).toBeNull();
    expect(view.queryByText('TU DÍA A DÍA')).toBeNull();
    expect(view.queryByLabelText('Poco movimiento')).toBeNull();
    expect(view.getByText(/^Lo cargás vos/)).toBeTruthy();
  });
  it('an ambiguous save is never retried automatically; recovery reuses the durable key', async () => {
    mockRequest.mockResolvedValueOnce(unavailable as never);
    const view = render(element(<ConfigurationScreen operation="energy" />));
    fireEvent.press(await view.findByLabelText('Poco movimiento'));
    await act(async () => fireEvent.press(view.getByText('Guardar cambios')));
    await view.findByText('Tu cambio sigue acá. Comprobá si llegó antes de hacer otro.');
    expect(mockRequest).toHaveBeenCalledTimes(1);
    const intent = mockRequest.mock.calls[0][0].body;
    expect(await AsyncStorage.getItem('ownlevel.nutrition.config.v1.owner')).toContain(
      (intent as { idempotencyKey: string }).idempotencyKey,
    );
    mockRequest.mockResolvedValueOnce(
      ok({
        status: 'confirmed',
        operation: 'energy',
        date: config.today,
        version,
        weightRecorded: false,
      }) as never,
    );
    await act(async () => fireEvent.press(view.getByText('Comprobar cambio')));
    expect(mockRequest.mock.calls[1][0].body).toEqual(intent);
    expect(await AsyncStorage.getItem('ownlevel.nutrition.config.v1.owner')).toBeNull();
  });
  it('independent summaries do not wait for stages; pending metrics are not a false empty list', async () => {
    mockRead.mockImplementation(async (options) => {
      if (options.path.includes('/stages') || options.path.includes('/metrics/'))
        return new Promise(() => {});
      return ok(
        options.path === '/api/mobile/v1/profile' ? { displayName, version } : config,
      ) as never;
    });
    const view = render(element());
    await view.findByText('2.250');
    expect(view.queryByText('Ninguna activa')).toBeNull();
    expect(view.queryByText('No disponibles ahora')).toBeNull();
  });
});
