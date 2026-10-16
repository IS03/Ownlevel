import { TextField } from '@/design-system';
export type BirthPickerProps = {
  value: string;
  today: string;
  onChange: (value: string) => void;
};
export type HeightWheelProps = {
  value: string;
  onChange: (value: string) => void;
};
export function BirthPicker({ value, onChange }: BirthPickerProps) {
  return <TextField label="Nacimiento (AAAA-MM-DD)" value={value} onChangeText={onChange} />;
}
export function HeightWheel({ value, onChange }: HeightWheelProps) {
  return (
    <TextField
      label="Altura (cm)"
      numeric
      keyboardType="number-pad"
      value={value}
      onChangeText={onChange}
    />
  );
}
