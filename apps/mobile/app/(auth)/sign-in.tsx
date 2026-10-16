import { useEffect, useState } from 'react';
import { useMobileAuth } from '@/auth';
import { authMessages } from '@/auth/errors';
import { useEntryMotion } from '@/entry/transition';
import { EntryView, type EntryMode } from '@/entry/view';

const SOON = 'Muy pronto vas a poder entrar así.';

function visibleNotice(message: string | undefined): string | undefined {
  if (message === authMessages.oauthCancelled) return undefined;
  // Keep service messages, with plain-language equivalents for development-only diagnostics.
  if (message === authMessages.configurationMissing) return 'No pudimos conectar. Probá de nuevo en un rato.';
  if (message === authMessages.callbackInvalid) return 'No pudimos completar el ingreso. Probá de nuevo.';
  return message;
}

export default function SignInScreen() {
  const { retry, signInWithGoogle, state } = useMobileAuth();
  const motion = useEntryMotion();
  const { registerEntry } = motion;
  const [soon, setSoon] = useState(false);
  useEffect(() => {
    registerEntry(true);
    return () => registerEntry(false);
  }, [registerEntry]);
  useEffect(() => {
    if (!soon) return;
    const timer = setTimeout(() => setSoon(false), 3500);
    return () => clearTimeout(timer);
  }, [soon]);

  const mode: EntryMode = state.status === 'BOOTSTRAPPING' ? 'bootstrapping'
    : state.status === 'SIGNING_IN' ? 'signing-in'
      : state.status === 'TRANSIENT_ERROR' ? 'error'
        : state.status === 'SIGNED_IN' ? 'complete' : 'signed-out';
  const serviceNotice = state.status === 'SIGNED_OUT' ? visibleNotice(state.notice)
    : state.status === 'TRANSIENT_ERROR' ? visibleNotice(state.message) : undefined;
  return <EntryView mode={mode} motion={motion} notice={mode === 'signed-out' && soon ? SOON : serviceNotice}
    onSoon={() => setSoon(true)}
    onGoogle={() => { setSoon(false); void signInWithGoogle(); }}
    onRetry={() => { setSoon(false); void retry(); }} />;
}
