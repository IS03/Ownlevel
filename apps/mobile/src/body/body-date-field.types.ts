/** `value` is the draft text (DD/MM/AAAA, what the controller validates); `today` is the server's Córdoba day (ISO). */
export type BodyDateFieldProps = { value: string; today: string; editable: boolean; onChange: (text: string) => void; error?: string };
