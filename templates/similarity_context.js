import {
  alloc_f64,
  dealloc_f64,
  wasm_memory,
  cosine_similarity_raw,
  cosine_distance_raw,
  euclidean_distance_raw,
  squared_euclidean_distance_raw,
} from './wasm_similarity_core.js';

export class SimilarityContext {
  /** @param {number} dim Vector dimensionality */
  constructor(dim) {
    this._dim = dim;
    this._ptrA = alloc_f64(dim);
    this._ptrB = alloc_f64(dim);
    this._freed = false;
  }

  /** @param {Float64Array} v */
  setA(v) {
    const f64 = new Float64Array(wasm_memory().buffer, this._ptrA, this._dim);
    f64.set(v);
  }

  /** @param {Float64Array} v */
  setB(v) {
    const f64 = new Float64Array(wasm_memory().buffer, this._ptrB, this._dim);
    f64.set(v);
  }

  /** @returns {number} */
  cosineSimilarity() {
    return cosine_similarity_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  /** @returns {number} */
  cosineDistance() {
    return cosine_distance_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  /** @returns {number} */
  euclideanDistance() {
    return euclidean_distance_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  /** @returns {number} */
  squaredEuclideanDistance() {
    return squared_euclidean_distance_raw(this._ptrA, this._dim, this._ptrB, this._dim);
  }

  free() {
    if (this._freed) return;
    this._freed = true;
    dealloc_f64(this._ptrA, this._dim);
    dealloc_f64(this._ptrB, this._dim);
  }
}
