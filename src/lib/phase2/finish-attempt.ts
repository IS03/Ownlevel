/** Transient UI fences always end; durable journals are owned by the attempt, never by cleanup. */
export async function runWorkoutFinishAttempt(attempt: () => Promise<void>, release: () => void, onFailure: () => void): Promise<void> {
  try { await attempt(); }
  catch { onFailure(); }
  finally { release(); }
}
