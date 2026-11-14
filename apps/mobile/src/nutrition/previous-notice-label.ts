/**
 * #511: visible name of the action that brings an older confirmation of the day to the front. It says what it does («Ver») and
 * of what («anteriores»), so it is never read as a second undo; «Deshacer» only ever refers to the confirmation on screen.
 */
export const previousNoticeLabel = (count: number): string => count === 1 ? 'Ver anterior' : `Ver anteriores · ${count}`;
