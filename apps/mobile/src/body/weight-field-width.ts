/**
 * Width of the big weight field in "Editar peso" / "Registrar peso" (#468).
 *
 * The width depends on the FONT only (size x Dynamic Type scale), never on what is typed: on iOS the keystroke lands in
 * the UITextField before JS can resize it, so any width derived from the current text lags one frame and the native
 * field scrolls its leading glyph out of view. A constant width, valid from the first frame, has no lag.
 */

/** The widest valid value (BODY_WEIGHT_MAX_KG = 999.99). Tabular numerals make every digit as wide as a 9. */
export const WEIGHT_REFERENCE_TEXT = '999,99';
/** Room for the caret and the glyph side bearings; the field is wider than its widest text by this much. */
export const WEIGHT_FIELD_PADDING = 12;

const CHARACTERS = Array.from(WEIGHT_REFERENCE_TEXT);
const DIGITS = CHARACTERS.filter(char => char !== ',').length;
const SEPARATORS = CHARACTERS.length - DIGITS;
// Generous upper bound (bold tabular SF Pro digit is about 0.62 em, the comma about 0.28 em): used until the real
// font has been measured, so the very first frame is never narrower than the content.
const ESTIMATE_DIGIT_EM = 0.7;
const ESTIMATE_SEPARATOR_EM = 0.4;
// Lower bound (a digit is never narrower than half an em): rejects a bogus measurement, e.g. one taken before the font loaded.
const FLOOR_DIGIT_EM = 0.5;
const FLOOR_SEPARATOR_EM = 0.25;

/** A width measured from the hidden reference text, tagged with the font scale it was measured at. */
export type MeasuredReference = { fontScale: number; width: number };

const emWidth = (fontSize: number, fontScale: number, digitEm: number, separatorEm: number) =>
  Math.ceil((DIGITS * digitEm + SEPARATORS * separatorEm) * fontSize * fontScale);

/** Synchronous worst-case width (padding included) for the reference text at this font size and scale. */
export function estimateWeightFieldWidth(fontSize: number, fontScale: number): number {
  return emWidth(fontSize, fontScale, ESTIMATE_DIGIT_EM, ESTIMATE_SEPARATOR_EM) + WEIGHT_FIELD_PADDING;
}

/**
 * The field width: the measured reference when it was taken at the current font scale (the real glyph widths) plus the
 * padding, otherwise the estimate. A measurement from another scale is stale for exactly the frame after a Dynamic Type
 * change, and the estimate covers that frame.
 */
export function weightFieldWidth(fontSize: number, fontScale: number, measured: MeasuredReference | null): number {
  if (!measured || measured.fontScale !== fontScale) return estimateWeightFieldWidth(fontSize, fontScale);
  const floor = emWidth(fontSize, fontScale, FLOOR_DIGIT_EM, FLOOR_SEPARATOR_EM);
  return Math.max(measured.width, floor) + WEIGHT_FIELD_PADDING;
}
