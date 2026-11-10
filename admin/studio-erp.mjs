// Retain the existing Durable Object class and its data; stop routing all writes to it.
export {CatalogWriter} from './worker.mjs';
import {retiredStudio} from './server/retired-studio.mjs';
import legacy from './worker.mjs';
export default {async fetch(request,env){return retiredStudio(request,r=>legacy.fetch(r,env));}};
