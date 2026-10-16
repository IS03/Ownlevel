import { render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import type { ReactNode } from 'react';
import { OwnlevelThemeProvider } from '@/design-system';
import SettingsLayout from '../../app/settings/_layout';

const mockScreens: { name: string; title?: string }[] = [];
jest.mock('expo-router', () => {
  function Stack({ children }: { children: ReactNode }) { return children; }
  function Screen({ name, options }: { name: string; options?: { title?: string } }) { mockScreens.push({ name, title: options?.title }); return null; }
  Stack.Screen = Screen;
  return { Stack };
});

describe('Settings stack', () => {
  it('titles every settings screen; /settings/metrics and /settings/diagnostics stay where they were', () => {
    render(<OwnlevelThemeProvider initialMode="light"><SettingsLayout /></OwnlevelThemeProvider>);
    expect(mockScreens).toEqual([
      { name: 'index', title: 'Ajustes' },
      { name: 'metrics', title: 'Métricas' },
      { name: 'diagnostics', title: 'Diagnóstico' },
      { name: 'account', title: 'Cuenta' },
      { name: 'app', title: 'App' },
      { name: 'energy', title: 'Energía' },
      { name: 'physical', title: 'Datos físicos' },
      { name: 'stages', title: 'Etapas' },
      { name: 'stage-action', title: 'Tu plan' },
      { name: 'stage-plan', title: 'Plan nutricional' },
      { name: 'stage-sequence', title: 'Programar etapas' },
    ]);
  });
});
