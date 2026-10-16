import { useEffect, useState } from 'react';
import { ManualMealEntry } from './manual-meal-entry';
import type { MealController, MealEditorState } from './meal-controller';

const DONE_MS = 700;

/**
 * Create, repeat and edit share the "Cargar a mano" screen (bocetos A4 and D3). A confirmed save keeps the
 * sheet for a moment with its check before it leaves. Deletes started from the day (undo, swipe) never show it.
 */
export function MealEditor({ controller, state }: { controller: MealController; state: MealEditorState }) {
  const [last, setLast] = useState<MealEditorState | null>(null);
  const [done, setDone] = useState(false);
  if (state.editor && !state.editor.headless && last !== state) setLast(state);
  // A delete from the day (headless) or a close without saving drops the held sheet.
  if ((state.editor?.headless || (!state.editor && !done)) && last) { setLast(null); if (done) setDone(false); }
  // Listeners run before the controller clears the editor: only a visible editor's save is held with its check.
  useEffect(() => controller.subscribeConfirmed(() => { if (!controller.getSnapshot().editor?.headless) setDone(true); }), [controller]);
  useEffect(() => {
    if (!done) return;
    const timer = setTimeout(() => { setDone(false); setLast(null); }, DONE_MS);
    return () => clearTimeout(timer);
  }, [done]);
  if (state.editor) return state.editor.headless ? null : <ManualMealEntry controller={controller} state={state} />;
  return done && last ? <ManualMealEntry controller={controller} state={last} done /> : null;
}
