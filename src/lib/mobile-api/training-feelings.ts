// Portable wire contract shared by the API, Web and Expo.
export * from "./training-feelings-contract";
import { MobileApiValidationError } from './auth';
import { parseFeelingsInput as input, parseFeelingsResponse as response, type FeelingsSaveInput, type FeelingsFinishInput } from './training-feelings-contract';
export function parseFeelingsInput(value: unknown, operation: 'save'): FeelingsSaveInput;
export function parseFeelingsInput(value: unknown, operation: 'finish'): FeelingsFinishInput;
export function parseFeelingsInput(value: unknown, operation: 'save' | 'finish') {
  try { return operation === 'save' ? input(value, 'save') : input(value, 'finish'); }
  catch { throw new MobileApiValidationError('Los datos de sensaciones no son válidos.'); }
}
export function parseFeelingsResponse(value: unknown) {
  try { return response(value); }
  catch { throw new MobileApiValidationError('Los datos de sensaciones no son válidos.'); }
}
