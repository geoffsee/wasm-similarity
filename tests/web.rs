//! Test suite for the Web and headless browsers.

#![cfg(target_arch = "wasm32")]

extern crate wasm_bindgen_test;

use rust_embed::Embed;
use serde::{Deserialize, Serialize};
use wasm_bindgen_test::*;
use wasm_similarity::{
    cosine_distance, cosine_distance_dataspace, cosine_similarity, cosine_similarity_dataspace,
    euclidean_distance, euclidean_distance_dataspace, hit_rate, jaccard_index,
    jaccard_index_dataspace, overshoot_rate, squared_euclidean_distance,
    squared_euclidean_distance_dataspace,
};
use web_sys::console;

wasm_bindgen_test_configure!(run_in_dedicated_worker);

#[wasm_bindgen_test]
fn pass() {
    assert_eq!(1 + 1, 2);
}

#[derive(Embed)]
#[folder = "test-data/"]
#[include = "*.json"]
#[prefix = "test-data/"]
struct Asset;

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct VectorDataspace {
    text_vectors: Vec<Vec<f64>>,
    query_vectors: Vec<f64>,
}

struct SimilarityCalculator;

impl SimilarityCalculator {
    fn cosine(vec1: &[f64], vec2: &[f64]) -> f64 {
        cosine_similarity(vec1, vec2)
    }
}

impl VectorDataspace {
    fn from_json(path: &str) -> Self {
        let asset = Asset::get(path).or_else(|| {
            if path.starts_with("test-data/") {
                Asset::get(&path[10..])
            } else {
                Asset::get(&format!("test-data/{}", path))
            }
        });

        if let Some(file) = asset {
            let json_str = std::str::from_utf8(&file.data).expect("Invalid UTF-8");
            serde_json::from_str(json_str).expect("Failed to parse JSON")
        } else {
            let json_str = match path {
                "test-data/vector_dataspace.json" | "vector_dataspace.json" => {
                    let bytes: &[u8] = include_bytes!("../test-data/vector_dataspace.json");
                    std::str::from_utf8(bytes).expect("Invalid UTF-8")
                }
                _ => panic!("Asset not found: {}", path),
            };
            serde_json::from_str(json_str).expect("Failed to parse JSON")
        }
    }

    fn flatten(&self) -> (Vec<f64>, usize, usize) {
        let num = self.text_vectors.len();
        let dim = self.query_vectors.len();
        let mut flat = Vec::with_capacity(num * dim);
        for tv in &self.text_vectors {
            flat.extend_from_slice(tv);
        }
        (flat, num, dim)
    }
}

/// Helper to parse interleaved [score, index, score, index, ...] results
fn parse_scored(result: &[f64]) -> Vec<(f64, usize)> {
    result
        .chunks_exact(2)
        .map(|c| (c[0], c[1] as usize))
        .collect()
}

#[wasm_bindgen_test]
fn test_cosine() {
    let vec_a = [1.0, 0.0, 0.0];
    let vec_b = [1.0, 0.0, 0.0];
    let similarity = SimilarityCalculator::cosine(&vec_a, &vec_b);
    assert_eq!(similarity, 1.0);

    let vec_c = [1.0, 0.0, 0.0];
    let vec_d = [0.0, 1.0, 0.0];
    let similarity2 = SimilarityCalculator::cosine(&vec_c, &vec_d);
    assert_eq!(similarity2, 0.0);

    web_sys::console::log_1(&"Cosine similarity function is working correctly!".into());
}

#[wasm_bindgen_test]
fn embeds_the_json_file_in_assets() {
    let asset_with_prefix = Asset::get("test-data/vector_dataspace.json");
    let asset_without_prefix = Asset::get("vector_dataspace.json");
    if let Some(_a) = asset_with_prefix.or(asset_without_prefix) {
        return;
    }
    let bytes: &[u8] = include_bytes!("../test-data/vector_dataspace.json");
    assert!(
        bytes.len() > 0,
        "Expected to include vector_dataspace.json via include_bytes!"
    );
}

#[wasm_bindgen_test]
fn test_vector_dataspace_from_json() {
    let _ = VectorDataspace::from_json("test-data/vector_dataspace.json");
}

#[wasm_bindgen_test]
fn test_cosine_vector_dataspace() {
    let vector_dataspace = VectorDataspace::from_json("test-data/vector_dataspace.json");

    let top_k = 1;
    let query_vector = vector_dataspace.query_vectors;

    let mut buffer: Vec<f64> = vec![];

    for text_vector in &vector_dataspace.text_vectors {
        let similarity = SimilarityCalculator::cosine(&query_vector, text_vector);
        if similarity.is_finite() && similarity > 0.0 {
            buffer.push(similarity);
        }
    }

    buffer.sort_by(|a, b| b.partial_cmp(a).unwrap());

    let top_k_similarities = buffer.iter().take(top_k).cloned().collect::<Vec<f64>>();

    assert_eq!(top_k_similarities.len(), 1);
}

#[wasm_bindgen_test]
fn test_cosine_distance() {
    let identical = cosine_distance(&[1.0, 0.0], &[1.0, 0.0]);
    assert_eq!(identical, 0.0);

    let orthogonal = cosine_distance(&[1.0, 0.0], &[0.0, 1.0]);
    assert_eq!(orthogonal, 1.0);
}

#[wasm_bindgen_test]
fn test_euclidean_distance() {
    let d = euclidean_distance(&[0.0, 0.0], &[3.0, 4.0]);
    assert!((d - 5.0).abs() < 1e-10);
}

#[wasm_bindgen_test]
fn test_squared_euclidean_distance() {
    let d = squared_euclidean_distance(&[0.0, 0.0], &[3.0, 4.0]);
    assert!((d - 25.0).abs() < 1e-10);
}

#[wasm_bindgen_test]
fn test_hit_rate() {
    let rate = hit_rate(&[1.0, 2.0, 3.0], &[1.1, 2.1, 3.1], 0.2);
    assert_eq!(rate, 1.0);
}

#[wasm_bindgen_test]
fn test_overshoot_rate() {
    let rate = overshoot_rate(&[1.0, 2.0], &[2.0, 3.0], 0.5);
    assert_eq!(rate, 1.0);
}

#[wasm_bindgen_test]
fn test_jaccard_index() {
    let j = jaccard_index(&[1, 2, 3], &[2, 3, 4]);
    assert!((j - 0.5).abs() < 1e-10);
}

// ---------------------------------------------------------------------------
// Dataspace typed-array tests
// ---------------------------------------------------------------------------

#[wasm_bindgen_test]
fn test_cosine_similarity_dataspace() {
    let ds = VectorDataspace::from_json("test-data/vector_dataspace.json");
    let (flat, num, dim) = ds.flatten();
    let result = cosine_similarity_dataspace(&flat, num, dim, &ds.query_vectors);
    let scored = parse_scored(&result);
    assert!(!scored.is_empty());
    // Descending scores
    for w in scored.windows(2) {
        assert!(w[0].0 >= w[1].0);
    }
    // All scores positive
    for (s, _) in &scored {
        assert!(*s > 0.0);
    }
}

#[wasm_bindgen_test]
fn test_cosine_distance_dataspace() {
    let ds = VectorDataspace::from_json("test-data/vector_dataspace.json");
    let (flat, num, dim) = ds.flatten();
    let result = cosine_distance_dataspace(&flat, num, dim, &ds.query_vectors);
    let scored = parse_scored(&result);
    assert!(!scored.is_empty());
    // Ascending scores
    for w in scored.windows(2) {
        assert!(w[0].0 <= w[1].0);
    }
}

#[wasm_bindgen_test]
fn test_euclidean_distance_dataspace() {
    let ds = VectorDataspace::from_json("test-data/vector_dataspace.json");
    let (flat, num, dim) = ds.flatten();
    let result = euclidean_distance_dataspace(&flat, num, dim, &ds.query_vectors);
    let scored = parse_scored(&result);
    assert!(!scored.is_empty());
    for w in scored.windows(2) {
        assert!(w[0].0 <= w[1].0);
    }
}

#[wasm_bindgen_test]
fn test_squared_euclidean_distance_dataspace() {
    let ds = VectorDataspace::from_json("test-data/vector_dataspace.json");
    let (flat, num, dim) = ds.flatten();
    let result = squared_euclidean_distance_dataspace(&flat, num, dim, &ds.query_vectors);
    let scored = parse_scored(&result);
    assert!(!scored.is_empty());
    for w in scored.windows(2) {
        assert!(w[0].0 <= w[1].0);
    }
}

#[wasm_bindgen_test]
fn test_squared_euclidean_equals_square_of_euclidean_dataspace() {
    let ds = VectorDataspace::from_json("test-data/vector_dataspace.json");
    let (flat, num, dim) = ds.flatten();
    let euc = parse_scored(&euclidean_distance_dataspace(
        &flat,
        num,
        dim,
        &ds.query_vectors,
    ));
    let sq = parse_scored(&squared_euclidean_distance_dataspace(
        &flat,
        num,
        dim,
        &ds.query_vectors,
    ));
    // Build index->score map from euclidean
    let mut euc_by_idx = std::collections::HashMap::new();
    for (s, i) in &euc {
        euc_by_idx.insert(*i, *s);
    }
    for (s, i) in &sq {
        let ed = euc_by_idx[i];
        assert!((s - ed * ed).abs() < 1e-4);
    }
}

#[wasm_bindgen_test]
fn test_jaccard_index_dataspace() {
    // sets_b: [2,3,4], [1,2,3], [5,6,7] — each size 3
    let set_a = [1i32, 2, 3];
    let sets_b_flat = [2i32, 3, 4, 1, 2, 3, 5, 6, 7];
    let result = jaccard_index_dataspace(&set_a, &sets_b_flat, 3, 3);
    let scored = parse_scored(&result);
    assert_eq!(scored.len(), 3);
    // Descending
    for w in scored.windows(2) {
        assert!(w[0].0 >= w[1].0);
    }
    // Identical set first (score 1.0)
    assert!((scored[0].0 - 1.0).abs() < 1e-10);
    // Disjoint set last (score 0.0)
    assert!((scored[2].0 - 0.0).abs() < 1e-10);
}
