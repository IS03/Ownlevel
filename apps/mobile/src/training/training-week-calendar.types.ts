import type { HubDayMark, HubMonthCell } from './training-hub-model';

/**
 * The pinned week calendar of Training. Collapsed it is the week strip; tapping a day
 * expands it in place into the month (the strip stays on top). The month header opens a
 * native month/year wheel. Days of the month open that day in History; future days don't.
 * Closing (tap outside, tap on the strip, swipe up) is wired by the screen.
 */
export type TrainingWeekCalendarProps = {
  expanded: boolean;
  marks: HubDayMark[];
  /** "YYYY-MM" shown by the expanded month. */
  month: string;
  monthCells: (HubMonthCell | null)[][];
  monthStatus: 'loading' | 'ready' | 'unavailable';
  today: string;
  years: number[];
  onCollapse: () => void;
  /** Height of the collapsed calendar, so the screen's content starts right below it. */
  onCollapsedHeight?: (height: number) => void;
  onExpand: () => void;
  onMonth: (month: string) => void;
  onOpenDay: (date: string) => void;
  /**
   * History: the brand 5-step intensity colors (index = level). Days are painted by their
   * `level` instead of the trained dot, the chosen day gets a ring and a legend is shown.
   */
  intensity?: readonly string[];
  selected?: string | null;
};

export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const monthKey = (year: number, monthNumber: number) => `${year}-${String(monthNumber).padStart(2, '0')}`;
