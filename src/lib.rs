mod metrics;
mod utils;

use std::cmp::Ordering;
use std::collections::HashSet;
use wasm_bindgen::prelude::*;

/// Displays a greeting in the console. Useful for verifying the WASM module loads correctly.
#[wasm_bindgen]
pub fn greet() {
    web_sys::console::log_1(&"Hello, wasm-similarity!".into());
}

// ---------------------------------------------------------------------------
// Memory management for zero-copy hot paths
// ---------------------------------------------------------------------------

/// Returns the WASM linear memory object for direct buffer access.
#[wasm_bindgen]
pub fn wasm_memory() -> JsValue {
    wasm_bindgen::memory()
}

/// Allocate a buffer of `len` f64 values in WASM linear memory.
/// Returns the byte offset (pointer). Caller must eventually call `dealloc_f64`.
#[wasm_bindgen]
pub fn alloc_f64(len: usize) -> *mut f64 {
    let layout = std::alloc::Layout::from_size_align(len * 8, 8).unwrap();
    unsafe { std::alloc::alloc(layout) as *mut f64 }
}

/// Free a buffer previously allocated with `alloc_f64`.
#[wasm_bindgen]
pub fn dealloc_f64(ptr: *mut f64, len: usize) {
    let layout = std::alloc::Layout::from_size_align(len * 8, 8).unwrap();
    unsafe {
        std::alloc::dealloc(ptr as *mut u8, layout);
    }
}

/// Cosine similarity operating on raw pointers into WASM linear memory.
/// Use with `alloc_f64` + direct memory writes to avoid per-call copy overhead.
#[wasm_bindgen]
pub fn cosine_similarity_raw(
    ptr_a: *const f64,
    len_a: usize,
    ptr_b: *const f64,
    len_b: usize,
) -> f64 {
    let a = unsafe { std::slice::from_raw_parts(ptr_a, len_a) };
    let b = unsafe { std::slice::from_raw_parts(ptr_b, len_b) };
    metrics::cosine_similarity(a, b)
}

/// Cosine distance operating on raw pointers into WASM linear memory.
#[wasm_bindgen]
pub fn cosine_distance_raw(
    ptr_a: *const f64,
    len_a: usize,
    ptr_b: *const f64,
    len_b: usize,
) -> f64 {
    let a = unsafe { std::slice::from_raw_parts(ptr_a, len_a) };
    let b = unsafe { std::slice::from_raw_parts(ptr_b, len_b) };
    metrics::cosine_distance(a, b)
}

/// Euclidean distance operating on raw pointers into WASM linear memory.
#[wasm_bindgen]
pub fn euclidean_distance_raw(
    ptr_a: *const f64,
    len_a: usize,
    ptr_b: *const f64,
    len_b: usize,
) -> f64 {
    let a = unsafe { std::slice::from_raw_parts(ptr_a, len_a) };
    let b = unsafe { std::slice::from_raw_parts(ptr_b, len_b) };
    metrics::euclidean_distance(a, b)
}

/// Squared Euclidean distance operating on raw pointers into WASM linear memory.
#[wasm_bindgen]
pub fn squared_euclidean_distance_raw(
    ptr_a: *const f64,
    len_a: usize,
    ptr_b: *const f64,
    len_b: usize,
) -> f64 {
    let a = unsafe { std::slice::from_raw_parts(ptr_a, len_a) };
    let b = unsafe { std::slice::from_raw_parts(ptr_b, len_b) };
    metrics::squared_euclidean_distance(a, b)
}

// ---------------------------------------------------------------------------
// Scalar metric exports
// ---------------------------------------------------------------------------

/// Computes the cosine similarity between two vectors, returning a value in [-1, 1].
/// Returns NaN if vectors differ in length or have zero magnitude.
#[wasm_bindgen]
pub fn cosine_similarity(slice_a: &[f64], slice_b: &[f64]) -> f64 {
    metrics::cosine_similarity(slice_a, slice_b)
}

/// Computes the cosine distance between two vectors, returning a value in [0, 2].
/// Returns NaN if vectors differ in length or have zero magnitude.
#[wasm_bindgen]
pub fn cosine_distance(slice_a: &[f64], slice_b: &[f64]) -> f64 {
    metrics::cosine_distance(slice_a, slice_b)
}

/// Computes the Euclidean distance between two vectors, returning a value ≥ 0.
/// Returns NaN if vectors differ in length.
#[wasm_bindgen]
pub fn euclidean_distance(slice_a: &[f64], slice_b: &[f64]) -> f64 {
    metrics::euclidean_distance(slice_a, slice_b)
}

/// Computes the squared Euclidean distance between two vectors, returning a value ≥ 0.
/// Returns NaN if vectors differ in length.
#[wasm_bindgen]
pub fn squared_euclidean_distance(slice_a: &[f64], slice_b: &[f64]) -> f64 {
    metrics::squared_euclidean_distance(slice_a, slice_b)
}

/// Computes the hit rate between actual and predicted values within a tolerance, returning a value in [0, 1].
/// Returns NaN if vectors differ in length.
#[wasm_bindgen]
pub fn hit_rate(actual: &[f64], predicted: &[f64], tolerance: f64) -> f64 {
    metrics::hit_rate(actual, predicted, tolerance)
}

/// Computes the overshoot rate between actual and predicted values within a tolerance, returning a value in [0, 1].
/// Returns NaN if vectors differ in length.
#[wasm_bindgen]
pub fn overshoot_rate(actual: &[f64], predicted: &[f64], tolerance: f64) -> f64 {
    metrics::overshoot_rate(actual, predicted, tolerance)
}

/// Computes the Jaccard index between two arrays treated as sets (duplicates ignored), returning a value in [0, 1].
#[wasm_bindgen]
pub fn jaccard_index(slice_a: &[i32], slice_b: &[i32]) -> f64 {
    let set_a: HashSet<i32> = slice_a.iter().copied().collect();
    let set_b: HashSet<i32> = slice_b.iter().copied().collect();
    metrics::jaccard_index(&set_a, &set_b)
}

// ---------------------------------------------------------------------------
// Dataspace exports (typed arrays, zero-copy)
// ---------------------------------------------------------------------------

/// Computes cosine similarity scores for each vector against a query vector.
/// `text_vectors_flat` is a row-major flattened array of `num_vectors` vectors each of length `dim`.
/// Returns a flat `Float64Array` of interleaved `[score0, index0, score1, index1, ...]`
/// sorted descending by score. Only vectors with positive finite scores are included.
#[wasm_bindgen]
pub fn cosine_similarity_dataspace(
    text_vectors_flat: &[f64],
    num_vectors: usize,
    dim: usize,
    query_vector: &[f64],
) -> Vec<f64> {
    rank_vector_dataspace::<CosineSimMetric>(text_vectors_flat, num_vectors, dim, query_vector)
}

/// Computes cosine distance scores for each vector against a query vector.
/// Returns `[score0, index0, score1, index1, ...]` sorted ascending by score.
#[wasm_bindgen]
pub fn cosine_distance_dataspace(
    text_vectors_flat: &[f64],
    num_vectors: usize,
    dim: usize,
    query_vector: &[f64],
) -> Vec<f64> {
    rank_vector_dataspace::<CosineDistMetric>(text_vectors_flat, num_vectors, dim, query_vector)
}

/// Computes euclidean distance scores for each vector against a query vector.
/// Returns `[score0, index0, score1, index1, ...]` sorted ascending by score.
#[wasm_bindgen]
pub fn euclidean_distance_dataspace(
    text_vectors_flat: &[f64],
    num_vectors: usize,
    dim: usize,
    query_vector: &[f64],
) -> Vec<f64> {
    rank_vector_dataspace::<EuclideanMetric>(text_vectors_flat, num_vectors, dim, query_vector)
}

/// Computes squared euclidean distance scores for each vector against a query vector.
/// Returns `[score0, index0, score1, index1, ...]` sorted ascending by score.
#[wasm_bindgen]
pub fn squared_euclidean_distance_dataspace(
    text_vectors_flat: &[f64],
    num_vectors: usize,
    dim: usize,
    query_vector: &[f64],
) -> Vec<f64> {
    rank_vector_dataspace::<SquaredEuclideanMetric>(
        text_vectors_flat,
        num_vectors,
        dim,
        query_vector,
    )
}

/// Computes Jaccard index scores for each set in `sets_b_flat` against `set_a`.
/// `sets_b_flat` is a flattened array of `num_sets` sets each of length `set_size`.
/// Returns `[score0, index0, score1, index1, ...]` sorted descending by score.
#[wasm_bindgen]
pub fn jaccard_index_dataspace(
    set_a: &[i32],
    sets_b_flat: &[i32],
    num_sets: usize,
    set_size: usize,
) -> Vec<f64> {
    let hash_a: HashSet<i32> = set_a.iter().copied().collect();
    let mut hash_b: HashSet<i32> = HashSet::new();

    let mut scored: Vec<(f64, usize)> = (0..num_sets)
        .map(|i| {
            let start = i * set_size;
            let end = start + set_size;
            let slice = &sets_b_flat[start..end];
            hash_b.clear();
            hash_b.reserve(slice.len());
            hash_b.extend(slice.iter().copied());
            (metrics::jaccard_index(&hash_a, &hash_b), i)
        })
        .collect();

    scored.sort_unstable_by(|(a, _), (b, _)| b.partial_cmp(a).unwrap_or(Ordering::Equal));

    let mut result = Vec::with_capacity(scored.len() * 2);
    for (score, idx) in scored {
        result.push(score);
        result.push(idx as f64);
    }
    result
}

// ---------------------------------------------------------------------------
// Internal: dataspace ranking
// ---------------------------------------------------------------------------

trait DataspaceMetric {
    fn compute(query: &[f64], candidate: &[f64]) -> f64;
    fn rank_order() -> Ordering;
    fn filter(score: f64) -> bool;
}

struct CosineSimMetric;
impl DataspaceMetric for CosineSimMetric {
    fn compute(query: &[f64], candidate: &[f64]) -> f64 {
        metrics::cosine_similarity(query, candidate)
    }
    fn rank_order() -> Ordering {
        Ordering::Greater
    }
    fn filter(score: f64) -> bool {
        score.is_finite() && score > 0.0
    }
}

struct CosineDistMetric;
impl DataspaceMetric for CosineDistMetric {
    fn compute(query: &[f64], candidate: &[f64]) -> f64 {
        metrics::cosine_distance(query, candidate)
    }
    fn rank_order() -> Ordering {
        Ordering::Less
    }
    fn filter(score: f64) -> bool {
        score.is_finite()
    }
}

struct EuclideanMetric;
impl DataspaceMetric for EuclideanMetric {
    fn compute(query: &[f64], candidate: &[f64]) -> f64 {
        metrics::euclidean_distance(query, candidate)
    }
    fn rank_order() -> Ordering {
        Ordering::Less
    }
    fn filter(score: f64) -> bool {
        score.is_finite()
    }
}

struct SquaredEuclideanMetric;
impl DataspaceMetric for SquaredEuclideanMetric {
    fn compute(query: &[f64], candidate: &[f64]) -> f64 {
        metrics::squared_euclidean_distance(query, candidate)
    }
    fn rank_order() -> Ordering {
        Ordering::Less
    }
    fn filter(score: f64) -> bool {
        score.is_finite()
    }
}

fn rank_vector_dataspace<M: DataspaceMetric>(
    flat: &[f64],
    num_vectors: usize,
    dim: usize,
    query: &[f64],
) -> Vec<f64> {
    if query.len() != dim || flat.len() != num_vectors * dim {
        return Vec::new();
    }

    let mut scored: Vec<(f64, usize)> = (0..num_vectors)
        .filter_map(|i| {
            let start = i * dim;
            let candidate = &flat[start..start + dim];
            let s = M::compute(query, candidate);
            if M::filter(s) { Some((s, i)) } else { None }
        })
        .collect();

    scored.sort_unstable_by(|(a, _), (b, _)| {
        if M::rank_order() == Ordering::Greater {
            b.partial_cmp(a).unwrap_or(Ordering::Equal)
        } else {
            a.partial_cmp(b).unwrap_or(Ordering::Equal)
        }
    });

    let mut result = Vec::with_capacity(scored.len() * 2);
    for (score, idx) in scored {
        result.push(score);
        result.push(idx as f64);
    }
    result
}
