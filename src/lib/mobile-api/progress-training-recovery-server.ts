import 'server-only';
import { MobileApiValidationError } from './auth';
import { progressQueryFromParams, progressReadResponse, resolveMobileProgressPeriod } from './progress-server';
import { readConsistentTrainingTimesSource } from './progress-training-times-server';
import { buildTrainingRecovery } from '../progress/training-recovery';
import { parseProgressTrainingRecovery, type RecoverySelection } from './progress-training-recovery-contract';

export const progressTrainingRecoveryResponse = (request: Request) => progressReadResponse(request, 'training.recovery', async (context, params, today) => {
  const query = progressQueryFromParams(params, ['scope', 'routine', 'bin', 'offset']);
  const scope = params.get('scope') ?? 'all', routine = params.get('routine'), bin = params.get('bin'), offset = params.get('offset') ?? '0';
  if (query.compare || !['all', 'routine'].includes(scope) || routine !== null && routine !== 'free' && !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(routine)
    || bin !== null && !/^[0-4]$/.test(bin) || !/^(?:0|[1-9][0-9]{0,6})$/.test(offset)) throw new MobileApiValidationError('Filtro de intervalo no válido.');
  const selection: RecoverySelection = { scope: scope as 'all' | 'routine', routine: routine?.toLowerCase() ?? null, bin: bin === null ? null : Number(bin), offset: Number(offset) };
  const { period } = resolveMobileProgressPeriod(query, today), { source, revision } = await readConsistentTrainingTimesSource(context, period, today);
  try { return buildTrainingRecovery(source, { today, period, revision, selection }); }
  catch (error) {
    if (error instanceof Error && error.message === 'Unknown timing routine') throw new MobileApiValidationError('La rutina ya no tiene registros en este período. Quitá el filtro.');
    throw error;
  }
}, parseProgressTrainingRecovery);
