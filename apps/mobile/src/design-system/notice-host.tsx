import { Fragment, createContext, useContext, useId, useLayoutEffect, useState, useSyncExternalStore, type PropsWithChildren, type ReactNode } from 'react';

import { NoticeStack, type NoticePlacement } from './transient-notice';

type Entry = { node: ReactNode; bottomOffset: number };

/** The notices every screen raised, in the order their owners first showed one. Presentation only: owners keep state and timers. */
class NoticeHub {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private snapshot: [string, Entry][] = [];
  set(id: string, entry: Entry | null) {
    if (entry) this.entries.set(id, entry); else if (!this.entries.delete(id)) return;
    this.snapshot = [...this.entries];
    this.listeners.forEach(listener => listener());
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
}

const Hub = createContext<NoticeHub | null>(null);

/**
 * One dock above the native tabs for the notices a screen raises (Inicio, Nutrición): a confirmation outlives the tab it was
 * raised in. Each tab is its own native view and hides everything inside it when another tab is shown, so a notice rendered in
 * its screen vanished on «Entrenar» and came back on return. Here it stays visible until its owner's window ends or it is
 * dismissed; its Undo still acts through the owner's controllers, which stay mounted with their tab.
 */
export function NoticeHost({ children }: PropsWithChildren) {
  const [hub] = useState(() => new NoticeHub());
  return <Hub.Provider value={hub}>{children}<HostStack hub={hub} /></Hub.Provider>;
}

function HostStack({ hub }: { hub: NoticeHub }) {
  const entries = useSyncExternalStore(hub.subscribe, hub.getSnapshot, hub.getSnapshot);
  // Always mounted, so a notice can play its exit when its owner drops it.
  const bottomOffset = Math.max(0, ...entries.map(([, entry]) => entry.bottomOffset));
  return <NoticeStack placement="tab" bottomOffset={bottomOffset} testID="notice-host">
    {entries.map(([id, entry]) => <Fragment key={id}>{entry.node}</Fragment>)}
  </NoticeStack>;
}

/** A screen's notices: through the tabs' host when there is one, in place (the same stack) otherwise. */
export function NoticeOutlet({ children, placement = 'tab', bottomOffset = 0, testID }: PropsWithChildren<{ placement?: NoticePlacement; bottomOffset?: number; testID?: string }>) {
  const hub = useContext(Hub);
  const id = useId();
  // The owner's latest notices on every render (their handlers close over its latest state), and gone with the owner.
  useLayoutEffect(() => { hub?.set(id, { node: children, bottomOffset }); });
  useLayoutEffect(() => () => { hub?.set(id, null); }, [hub, id]);
  return hub ? null : <NoticeStack placement={placement} bottomOffset={bottomOffset} testID={testID}>{children}</NoticeStack>;
}
