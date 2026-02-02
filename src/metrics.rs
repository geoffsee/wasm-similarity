//! f64-specialized metric implementations with `#[inline(always)]` for optimal WASM codegen.
//! Replaces the generic `similarity` crate to eliminate monomorphization overhead.

use std::collections::HashSet;

#[inline(always)]
pub fn cosine_similarity(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() {
        return f64::NAN;
    }
    let len = a.len();
    let mut dot0 = 0.0_f64;
    let mut dot1 = 0.0_f64;
    let mut dot2 = 0.0_f64;
    let mut dot3 = 0.0_f64;
    let mut na0 = 0.0_f64;
    let mut na1 = 0.0_f64;
    let mut na2 = 0.0_f64;
    let mut na3 = 0.0_f64;
    let mut nb0 = 0.0_f64;
    let mut nb1 = 0.0_f64;
    let mut nb2 = 0.0_f64;
    let mut nb3 = 0.0_f64;
    let chunks = len / 4;
    let remainder = len % 4;
    for i in 0..chunks {
        let base = i * 4;
        let va0 = unsafe { *a.get_unchecked(base) };
        let vb0 = unsafe { *b.get_unchecked(base) };
        let va1 = unsafe { *a.get_unchecked(base + 1) };
        let vb1 = unsafe { *b.get_unchecked(base + 1) };
        let va2 = unsafe { *a.get_unchecked(base + 2) };
        let vb2 = unsafe { *b.get_unchecked(base + 2) };
        let va3 = unsafe { *a.get_unchecked(base + 3) };
        let vb3 = unsafe { *b.get_unchecked(base + 3) };
        dot0 += va0 * vb0;
        dot1 += va1 * vb1;
        dot2 += va2 * vb2;
        dot3 += va3 * vb3;
        na0 += va0 * va0;
        na1 += va1 * va1;
        na2 += va2 * va2;
        na3 += va3 * va3;
        nb0 += vb0 * vb0;
        nb1 += vb1 * vb1;
        nb2 += vb2 * vb2;
        nb3 += vb3 * vb3;
    }
    let tail_start = chunks * 4;
    for i in 0..remainder {
        let va = unsafe { *a.get_unchecked(tail_start + i) };
        let vb = unsafe { *b.get_unchecked(tail_start + i) };
        dot0 += va * vb;
        na0 += va * va;
        nb0 += vb * vb;
    }
    let dot = (dot0 + dot1) + (dot2 + dot3);
    let norm_a = (na0 + na1) + (na2 + na3);
    let norm_b = (nb0 + nb1) + (nb2 + nb3);
    let denom = (norm_a * norm_b).sqrt();
    if denom == 0.0 {
        f64::NAN
    } else {
        dot / denom
    }
}

#[inline(always)]
pub fn cosine_distance(a: &[f64], b: &[f64]) -> f64 {
    let s = cosine_similarity(a, b);
    if s.is_nan() { f64::NAN } else { 1.0 - s }
}

#[inline(always)]
pub fn euclidean_distance(a: &[f64], b: &[f64]) -> f64 {
    let s = squared_euclidean_distance(a, b);
    if s.is_nan() { f64::NAN } else { s.sqrt() }
}

#[inline(always)]
pub fn squared_euclidean_distance(a: &[f64], b: &[f64]) -> f64 {
    if a.len() != b.len() {
        return f64::NAN;
    }
    let len = a.len();
    let mut s0 = 0.0_f64;
    let mut s1 = 0.0_f64;
    let mut s2 = 0.0_f64;
    let mut s3 = 0.0_f64;
    let chunks = len / 4;
    let remainder = len % 4;
    for i in 0..chunks {
        let base = i * 4;
        let d0 = unsafe { *a.get_unchecked(base) } - unsafe { *b.get_unchecked(base) };
        let d1 = unsafe { *a.get_unchecked(base + 1) } - unsafe { *b.get_unchecked(base + 1) };
        let d2 = unsafe { *a.get_unchecked(base + 2) } - unsafe { *b.get_unchecked(base + 2) };
        let d3 = unsafe { *a.get_unchecked(base + 3) } - unsafe { *b.get_unchecked(base + 3) };
        s0 += d0 * d0;
        s1 += d1 * d1;
        s2 += d2 * d2;
        s3 += d3 * d3;
    }
    let tail_start = chunks * 4;
    for i in 0..remainder {
        let d = unsafe { *a.get_unchecked(tail_start + i) } - unsafe { *b.get_unchecked(tail_start + i) };
        s0 += d * d;
    }
    (s0 + s1) + (s2 + s3)
}

#[inline(always)]
pub fn hit_rate(actual: &[f64], predicted: &[f64], tolerance: f64) -> f64 {
    if actual.len() != predicted.len() {
        return f64::NAN;
    }
    let len = actual.len();
    let mut hits = 0usize;
    for i in 0..len {
        let diff = unsafe { *actual.get_unchecked(i) } - unsafe { *predicted.get_unchecked(i) };
        if diff.abs() <= tolerance {
            hits += 1;
        }
    }
    hits as f64 / len as f64
}

#[inline(always)]
pub fn overshoot_rate(actual: &[f64], predicted: &[f64], tolerance: f64) -> f64 {
    if actual.len() != predicted.len() {
        return f64::NAN;
    }
    let len = actual.len();
    let mut overshoots = 0usize;
    for i in 0..len {
        let a = unsafe { *actual.get_unchecked(i) };
        let p = unsafe { *predicted.get_unchecked(i) };
        if p > a + tolerance {
            overshoots += 1;
        }
    }
    overshoots as f64 / len as f64
}

#[inline(always)]
pub fn jaccard_index(set_a: &HashSet<i32>, set_b: &HashSet<i32>) -> f64 {
    let intersection = set_a.intersection(set_b).count();
    let union = set_a.union(set_b).count();
    if union == 0 {
        0.0
    } else {
        intersection as f64 / union as f64
    }
}
