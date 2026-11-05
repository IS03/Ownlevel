/** Transient UI fences end unless the finish was confirmed: the refreshed completed detail replaces them. Durable journals are owned by the attempt, never by cleanup. */
export async function runWorkoutFinishAttempt(attempt: () => Promise<'confirmed' | void>, release: () => void, onFailure: () => void): Promise<void> {
  let confirmed = false;
  try { confirmed = (await attempt()) === 'confirmed'; }
  catch { onFailure(); }
  finally { if (!confirmed) release(); }
}
