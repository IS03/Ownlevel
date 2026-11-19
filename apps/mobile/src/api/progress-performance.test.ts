import { expect, it, jest } from '@jest/globals';
import type { MobileApiClient } from './client';
import { fetchProgressTraining, fetchProgressOverview } from './progress';
const meta = {durationMs:1,httpStatus:200,outcome:'ok' as const};
it.each([fetchProgressTraining, fetchProgressOverview])('asks for the expanded canonical methods without extra reads on a capable server', async load => {
  const read = jest.fn<MobileApiClient['read']>().mockResolvedValue({status:'ok',data:{},meta} as never);
  await load({read} as unknown as MobileApiClient,{period:'30'});
  expect(read).toHaveBeenCalledTimes(1); expect(read.mock.calls[0][0].path).toContain('inPeriod=2');
});
it.each([fetchProgressTraining, fetchProgressOverview])('only a validation rejection falls back to the legacy read', async load => {
  const read = jest.fn<MobileApiClient['read']>().mockResolvedValueOnce({status:'unavailable',reason:'network',meta:{...meta,httpStatus:400,outcome:'unavailable'}} as never).mockResolvedValueOnce({status:'ok',data:{},meta} as never);
  await load({read} as unknown as MobileApiClient,{period:'30'});
  expect(read).toHaveBeenCalledTimes(2); expect(read.mock.calls[1][0].path).toContain('inPeriod=1');
  read.mockReset().mockResolvedValue({status:'unavailable',reason:'network',meta:{...meta,httpStatus:null,outcome:'unavailable'}} as never);
  await load({read} as unknown as MobileApiClient,{period:'30'}); expect(read).toHaveBeenCalledTimes(1);
});
