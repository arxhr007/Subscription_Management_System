import {afterEach,expect,it,vi} from 'vitest';
import {gmailGet} from './gmail';
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers()});
it('retries transient Gmail limits instead of reporting missing API access',async()=>{
 vi.useFakeTimers();const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{errors:[{reason:'userRateLimitExceeded'}]}}),{status:403})).mockResolvedValueOnce(new Response(JSON.stringify({messages:[]})));vi.stubGlobal('fetch',fetch);
 const result=gmailGet('test-token','messages');await vi.runAllTimersAsync();await expect(result).resolves.toEqual({messages:[]});expect(fetch).toHaveBeenCalledTimes(2);
});
it('keeps permission denial distinct from a temporary limit',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{errors:[{reason:'insufficientPermissions'}]}}),{status:403})));
 await expect(gmailGet('test-token','messages')).rejects.toMatchObject({status:403});
});
