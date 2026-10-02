import { handleManioRequest } from '../_shared/manio-handlers.ts';
import { manioDependencies } from '../_shared/manio-runtime.ts';
Deno.serve(request => handleManioRequest(request, 'sync', manioDependencies));
