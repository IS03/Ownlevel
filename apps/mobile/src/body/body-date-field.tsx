import { TextField } from '@/design-system';

import type { BodyDateFieldProps } from './body-date-field.types';

/** Outside iOS the date stays a typed field (DD/MM/AAAA). */
export function BodyDateField({ value, editable, onChange, error }: BodyDateFieldProps) {
  return <TextField label="Fecha" value={value} onChangeText={onChange} error={error} disabled={!editable} keyboardType="numbers-and-punctuation"
    placeholder="DD/MM/AAAA" autoCorrect={false} selectTextOnFocus numeric />;
}
