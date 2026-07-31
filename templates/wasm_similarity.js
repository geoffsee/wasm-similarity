import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { initSync } from './wasm_similarity_core.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmBytes = readFileSync(join(__dirname, 'wasm_similarity_bg.wasm'));
initSync({ module: wasmBytes });

export * from './wasm_similarity_core.js';
export { SimilarityContext } from './similarity_context.js';
