import { TextField } from "@/design-system";
export type StartDateProps = {
  value: string;
  minimum: string;
  onChange: (date: string) => void;
};
export function StartDatePicker({ value, onChange }: StartDateProps) {
  return (
    <TextField
      label="Fecha de inicio"
      hint="Año, mes y día"
      value={value}
      onChangeText={onChange}
      placeholder="AAAA-MM-DD"
    />
  );
}
