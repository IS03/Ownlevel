"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteWeightHistoryEntryAction, recordWeightAction, updateWeightHistoryEntryAction } from "@/app/(app)/train/body/actions";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { cn } from "@/lib/utils";
import { isValidBodyWeightKg, formatWeightKg, type WeightHistoryPoint } from "@/lib/weight-history";

type Props = {
  entries: WeightHistoryPoint[];
  currentWeightKg: number | null;
  today: string;
  onEntriesChange: (entries: WeightHistoryPoint[]) => void;
  onCurrentWeightChange: (weight: number | null) => void;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Argentina/Cordoba" })
    .format(new Date(`${value}T12:00:00Z`)).replaceAll(" de ", " ").replace(".", "");
}

function Sheet({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 z-[82] bg-black/45 backdrop-blur-[2px]" /><Dialog.Viewport className="fixed inset-0 z-[83] flex items-end justify-center overflow-hidden sm:items-center sm:p-6"><Dialog.Popup className="max-h-[calc(100dvh-env(safe-area-inset-top))] w-full overflow-y-auto overscroll-contain rounded-t-[1.5rem] bg-card px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 text-card-foreground shadow-2xl outline-none sm:max-w-sm sm:rounded-2xl sm:border sm:p-5">{children}</Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}

function FloatingField({ label, unit, children, className }: { label: string; unit?: string; children: React.ReactNode; className?: string }) {
  return <label className={cn("relative flex min-h-12 items-center rounded-xl border border-input bg-card px-3 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/35", className)}>
    <span className="absolute -top-2 left-2 bg-card px-1 text-[11px] font-medium text-muted-foreground">{label}</span>
    <span className="min-w-0 flex-1">{children}</span>
    {unit ? <span className="ml-2 text-xs text-muted-foreground">{unit}</span> : null}
  </label>;
}

export function WeightHistory({ entries, currentWeightKg, today, onEntriesChange, onCurrentWeightChange }: Props) {
  const [recordOpen, setRecordOpen] = useState(false);
  const [recordDate, setRecordDate] = useState(today);
  const [recordWeight, setRecordWeight] = useState("");
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingWeight, setEditingWeight] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<WeightHistoryPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyCurrentWeight(result: { syncedCurrentWeight: boolean; currentWeightKg: number | null }) {
    if (result.syncedCurrentWeight) onCurrentWeightChange(result.currentWeightKg);
  }

  function registerWeight() {
    setError(null);
    startTransition(async () => {
      const result = await recordWeightAction({ logDate: recordDate, weight: recordWeight });
      if (!result.ok || !result.entry) { setError(result.ok ? "No se pudo registrar el peso." : result.error); return; }
      onEntriesChange([...entries.filter((entry) => entry.log_date !== result.entry!.log_date), result.entry!].sort((a, b) => a.log_date.localeCompare(b.log_date)));
      applyCurrentWeight(result);
      setRecordOpen(false); setRecordWeight(""); setRecordDate(today);
    });
  }

  function saveEdit(logDate: string) {
    setError(null);
    startTransition(async () => {
      const result = await updateWeightHistoryEntryAction({ logDate, weight: editingWeight });
      if (!result.ok || !result.entry) { setError(result.ok ? "No se pudo actualizar el peso." : result.error); return; }
      onEntriesChange(entries.map((entry) => entry.log_date === logDate ? result.entry! : entry));
      applyCurrentWeight(result); setEditingDate(null);
    });
  }

  function deleteEntry() {
    if (!deleteTarget) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteWeightHistoryEntryAction({ logDate: deleteTarget.log_date });
      if (!result.ok) { setError(result.error); return; }
      onEntriesChange(entries.filter((entry) => entry.log_date !== deleteTarget.log_date));
      applyCurrentWeight(result); setDeleteTarget(null);
    });
  }

  return <section className="space-y-3" aria-labelledby="weight-records-title">
    <div className="flex items-center justify-between gap-3"><div><h3 id="weight-records-title" className="font-semibold">Peso</h3><p className="text-xs text-muted-foreground">{entries.length} {entries.length === 1 ? "registro" : "registros"}{currentWeightKg === null ? "" : ` · actual ${formatWeightKg(currentWeightKg)} kg`}</p></div><Button type="button" size="sm" onClick={() => { setError(null); setRecordOpen(true); }}><Plus className="size-4" aria-hidden />Registrar</Button></div>
    <details className="rounded-xl border bg-card px-3 py-1.5"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium marker:content-none"><span>Ver registros de peso</span><span className="text-xs font-normal text-muted-foreground">Editar</span></summary><div className="divide-y border-t">{[...entries].reverse().map((entry) => <div key={entry.id} className="py-3">
      {editingDate === entry.log_date ? <div className="space-y-3"><FloatingField label={`Peso · ${formatDate(entry.log_date)}`} unit="kg"><input value={editingWeight} onChange={(event) => setEditingWeight(event.target.value)} inputMode="decimal" className="h-10 w-full bg-transparent text-base outline-none" aria-invalid={Boolean(error)} /></FloatingField><div className="flex justify-end gap-2"><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setEditingDate(null); setError(null); }}>Cancelar</Button><Button type="button" size="sm" disabled={pending} onClick={() => saveEdit(entry.log_date)}>{pending ? "Guardando…" : "Guardar"}</Button></div></div> : <div className="flex items-center justify-between gap-3"><div><p className="text-sm font-medium">{formatDate(entry.log_date)}</p><p className="metric-number text-sm text-muted-foreground">{formatWeightKg(entry.weight_kg)} kg{isValidBodyWeightKg(entry.weight_kg) ? "" : " · no cuenta: no es un peso"}</p></div><div className="flex"><Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => { setEditingDate(entry.log_date); setEditingWeight(String(entry.weight_kg)); setError(null); }}><Pencil className="size-3.5" aria-hidden />Editar</Button><Button type="button" size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={() => setDeleteTarget(entry)}><Trash2 className="size-3.5" aria-hidden /><span className="sr-only">Eliminar peso del {formatDate(entry.log_date)}</span></Button></div></div>}
    </div>)}{entries.length === 0 ? <p className="py-4 text-sm text-muted-foreground">Todavía no registraste peso.</p> : null}</div></details>
    {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
    <Sheet open={recordOpen} onOpenChange={(open) => { if (!pending) setRecordOpen(open); }}><div className="flex items-center justify-between gap-3"><Dialog.Title className="font-semibold">Registrar peso</Dialog.Title><Dialog.Close disabled={pending} className="flex size-11 items-center justify-center rounded-full"><X className="size-4" /><span className="sr-only">Cerrar</span></Dialog.Close></div><div className="mt-5 space-y-4"><FloatingField label="Peso" unit="kg"><input value={recordWeight} onChange={(event) => setRecordWeight(event.target.value)} inputMode="decimal" placeholder="65,8" className="h-10 w-full bg-transparent text-base outline-none" autoFocus /></FloatingField><FloatingField label="Fecha"><DateField value={recordDate} onChange={(event) => setRecordDate(event.target.value)} className="h-10 border-0 px-0 focus-within:ring-0" /></FloatingField><Button type="button" className="h-11 w-full" disabled={pending} onClick={registerWeight}>{pending ? "Guardando…" : "Guardar"}</Button></div></Sheet>
    <Sheet open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open && !pending) setDeleteTarget(null); }}><div className="flex items-center justify-between gap-3"><Dialog.Title className="font-semibold">¿Eliminar este registro?</Dialog.Title><Dialog.Close className="flex size-11 items-center justify-center"><X className="size-4" /><span className="sr-only">Cerrar</span></Dialog.Close></div><Dialog.Description className="mt-2 text-sm text-muted-foreground">Se eliminará sólo el peso del {deleteTarget ? formatDate(deleteTarget.log_date) : ""}. El resto de ese día se conserva.</Dialog.Description><div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button><Button variant="destructive" disabled={pending} onClick={deleteEntry}>{pending ? "Eliminando…" : "Eliminar"}</Button></div></Sheet>
  </section>;
}
