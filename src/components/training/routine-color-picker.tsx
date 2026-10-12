"use client";

import { Check } from "lucide-react";
import { useId, type CSSProperties } from "react";
import {
  ROUTINE_COLOR_PRESETS,
  resolveRoutineColor,
  routineColorCheckColors,
  routineColorCssVariable,
  routineColorLabel,
  type RoutineColorKey,
} from "@/lib/phase2/routine-colors";
import { cn } from "@/lib/utils";

export function RoutineColorPicker({
  value,
  onChange,
  name = "color",
}: {
  value: RoutineColorKey | null | string;
  onChange: (color: RoutineColorKey) => void;
  name?: string;
}) {
  const labelId = useId();
  const selected = resolveRoutineColor(value);

  return (
    <div className="space-y-2" role="radiogroup" aria-labelledby={labelId}>
      <input type="hidden" name={name} value={selected} />
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-sm font-medium">Color</span>
        <span className="text-xs text-muted-foreground">{routineColorLabel(selected)}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {ROUTINE_COLOR_PRESETS.map((preset) => {
          const checked = preset.key === selected;
          const checkColors = routineColorCheckColors(preset.key);
          return (
            <button
              key={preset.key}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={preset.label}
              onClick={() => onChange(preset.key)}
              className={cn(
                "flex size-11 touch-manipulation items-center justify-center rounded-xl border-2 outline-none transition-[border-color,box-shadow,transform] hover:scale-[1.03] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-95",
                checked ? "border-foreground/70 shadow-sm" : "border-transparent",
              )}
              style={{
                backgroundColor: routineColorCssVariable(preset.key),
                "--routine-check-light": checkColors.light,
                "--routine-check-dark": checkColors.dark,
              } as CSSProperties}
            >
              {checked ? <Check className="size-4 text-[var(--routine-check-light)] dark:text-[var(--routine-check-dark)]" strokeWidth={3} aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
