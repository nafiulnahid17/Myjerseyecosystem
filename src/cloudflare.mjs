import { handleRequest } from './worker.mjs';
import studio from './production-studio.mjs';
export { JerseyProduction } from './production-studio.mjs';

export default {
  fetch(request, env) {
    return handleRequest(request, env, studio);
  },
};
