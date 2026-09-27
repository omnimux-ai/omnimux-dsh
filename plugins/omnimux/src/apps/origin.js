/**
 * Compatibility re-export. The implementation lives in the shared HTTP
 * primitives boundary at src/http/local-origin.js; Apps business modules keep
 * this import path working until consumers are migrated individually.
 */
export { assertLocalWrite, readOriginHeaders } from '../http/local-origin.js'
