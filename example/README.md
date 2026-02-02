# WASM Similarity Test Package

This is a test npm package that demonstrates the usage of the `wasm-similarity` WebAssembly module for computing cosine similarity between vectors.

## Overview

The `wasm-similarity` module provides three main functions:

1. **`greet()`** - A simple greeting function (calls `alert()` in browser environments)
2. **`cosine_similarity(vector1, vector2)`** - Computes cosine similarity between two vectors
3. **`cosine_similarity_dataspace_json(jsonString)`** - Processes a JSON dataspace and returns text vectors sorted by similarity to a query vector

## Installation

This test package uses a local file dependency to the WASM module:

```bash
npm install
```

## Usage

### Basic Import

```javascript
import { greet, cosine_similarity, cosine_similarity_dataspace_json } from 'wasm-similarity';
```

### Cosine Similarity

Calculate similarity between two vectors (returns a value between 0 and 1):

```javascript
const vector1 = [1.0, 2.0, 3.0];
const vector2 = [4.0, 5.0, 6.0];
const similarity = cosine_similarity(vector1, vector2);
console.log(similarity); // ~0.975
```

### JSON Dataspace Processing

Process multiple text vectors and rank them by similarity to a query vector:

```javascript
const dataspace = {
    textVectors: [
        [1.0, 0.0, 0.0],
        [0.0, 1.0, 0.0],
        [0.0, 0.0, 1.0],
        [1.0, 1.0, 0.0]
    ],
    queryVectors: [1.0, 0.0, 0.0]
};

const result = cosine_similarity_dataspace_json(JSON.stringify(dataspace));
console.log(result); // Returns vectors sorted by similarity to query
```

## Running Tests

Execute the test suite to verify all functionality:

```bash
npm test
# or
npm start
```

## Test Results

The test suite verifies:
- ✅ Basic function imports and calls
- ✅ Cosine similarity calculations with various vector pairs
- ✅ JSON dataspace processing with proper sorting
- ✅ Error handling for invalid inputs
- ✅ Edge cases (empty vectors, malformed JSON)

## Technical Notes

- The module is compiled from Rust using `wasm-bindgen`
- Uses ES modules (`"type": "module"`)
- WebAssembly import may show experimental warnings in Node.js (this is normal)
- The `greet()` function calls `alert()` which is not available in Node.js environments

## Requirements

- Node.js with ES modules support
- The compiled WASM artifacts must be available in the `../pkg` directory

## Performance

The WebAssembly implementation provides high-performance vector similarity calculations suitable for:
- Large-scale vector comparisons
- Real-time similarity searches  
- Browser and Node.js environments
- Memory-efficient processing of vector datasets