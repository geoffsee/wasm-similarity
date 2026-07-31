import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
    cosine_similarity,
    cosine_similarity_dataspace,
    cosine_distance,
    cosine_distance_dataspace,
    euclidean_distance,
    euclidean_distance_dataspace,
    squared_euclidean_distance,
    squared_euclidean_distance_dataspace,
    hit_rate,
    overshoot_rate,
    jaccard_index,
    jaccard_index_dataspace,
} from 'wasm-similarity';

const rootDir = resolve(__dirname, '..');
const dataspaceFile = resolve(rootDir, 'test-data', 'vector_dataspace.json');
if (!existsSync(dataspaceFile)) {
    execSync(`tar xzf test-data/test-data.tar.gz test-data/vector_dataspace.json`, { cwd: rootDir });
}

const dataspaceJson = readFileSync(dataspaceFile, 'utf-8');
const dataspace = JSON.parse(dataspaceJson);

// Pre-flatten the dataspace for typed-array API
const numVectors = dataspace.textVectors.length;
const dim = dataspace.queryVectors.length;
const flat = new Float64Array(numVectors * dim);
for (let i = 0; i < numVectors; i++) {
    flat.set(dataspace.textVectors[i], i * dim);
}
const queryF64 = new Float64Array(dataspace.queryVectors);

function assertCloseTo(actual: number, expected: number, precision = 5) {
    const tolerance = Math.pow(10, -precision) / 2;
    assert.ok(
        Math.abs(actual - expected) < tolerance,
        `Expected ${actual} to be close to ${expected} (tolerance ${tolerance})`,
    );
}

/** Parse interleaved [score, index, score, index, ...] Float64Array */
function parseScored(result: Float64Array): { score: number; index: number }[] {
    const out: { score: number; index: number }[] = [];
    for (let i = 0; i < result.length; i += 2) {
        out.push({ score: result[i], index: result[i + 1] });
    }
    return out;
}

describe('wasm-similarity with vector_dataspace.json', () => {
    it('dataspace has expected shape', () => {
        assert.equal(dataspace.textVectors.length, 151);
        assert.equal(dataspace.queryVectors.length, 3072);
        assert.equal(dataspace.textVectors[0].length, 3072);
    });

    describe('cosine_similarity_dataspace', () => {
        it('ranks all text vectors by similarity and returns scored results', () => {
            const ranked = parseScored(cosine_similarity_dataspace(flat, numVectors, dim, queryF64));
            assert.equal(ranked.length, dataspace.textVectors.length);
            assert.ok(ranked[0].score !== undefined);
            assert.ok(ranked[0].index !== undefined);
        });

        it('returns results in descending score order', () => {
            const ranked = parseScored(cosine_similarity_dataspace(flat, numVectors, dim, queryF64));
            for (let i = 1; i < ranked.length; i++) {
                assert.ok(ranked[i - 1].score >= ranked[i].score);
            }
        });

        it('scores are positive', () => {
            const ranked = parseScored(cosine_similarity_dataspace(flat, numVectors, dim, queryF64));
            for (const r of ranked) {
                assert.ok(r.score > 0);
            }
        });

        it('index refers to valid position in textVectors', () => {
            const ranked = parseScored(cosine_similarity_dataspace(flat, numVectors, dim, queryF64));
            for (const r of ranked) {
                assert.ok(r.index >= 0 && r.index < numVectors);
            }
        });

        it('returns empty for dimension mismatch', () => {
            const badQuery = new Float64Array([1, 2]);
            const result = cosine_similarity_dataspace(flat, numVectors, dim, badQuery);
            assert.equal(result.length, 0);
        });
    });

    describe('cosine_distance_dataspace', () => {
        it('ranks text vectors by distance ascending', () => {
            const ranked = parseScored(cosine_distance_dataspace(flat, numVectors, dim, queryF64));
            assert.ok(ranked.length > 0);
            for (let i = 1; i < ranked.length; i++) {
                assert.ok(ranked[i - 1].score <= ranked[i].score);
            }
        });
    });

    describe('euclidean_distance_dataspace', () => {
        it('ranks text vectors by distance ascending', () => {
            const ranked = parseScored(euclidean_distance_dataspace(flat, numVectors, dim, queryF64));
            assert.ok(ranked.length > 0);
            for (let i = 1; i < ranked.length; i++) {
                assert.ok(ranked[i - 1].score <= ranked[i].score);
            }
        });
    });

    describe('squared_euclidean_distance_dataspace', () => {
        it('ranks text vectors by distance ascending', () => {
            const ranked = parseScored(squared_euclidean_distance_dataspace(flat, numVectors, dim, queryF64));
            assert.ok(ranked.length > 0);
            for (let i = 1; i < ranked.length; i++) {
                assert.ok(ranked[i - 1].score <= ranked[i].score);
            }
        });

        it('scores equal square of euclidean distances', () => {
            const eucRanked = parseScored(euclidean_distance_dataspace(flat, numVectors, dim, queryF64));
            const sqRanked = parseScored(squared_euclidean_distance_dataspace(flat, numVectors, dim, queryF64));
            const eucByIndex = new Map(eucRanked.map(r => [r.index, r.score]));
            for (const r of sqRanked) {
                const ed = eucByIndex.get(r.index)!;
                assertCloseTo(r.score, ed * ed, 4);
            }
        });
    });

    describe('jaccard_index_dataspace', () => {
        it('ranks sets by Jaccard similarity descending', () => {
            const setA = new Int32Array([1, 2, 3]);
            const setsB = new Int32Array([2, 3, 4, 1, 2, 3, 5, 6, 7]);
            const ranked = parseScored(jaccard_index_dataspace(setA, setsB, 3, 3));
            assert.equal(ranked.length, 3);
            for (let i = 1; i < ranked.length; i++) {
                assert.ok(ranked[i - 1].score >= ranked[i].score);
            }
            assertCloseTo(ranked[0].score, 1.0);
            assertCloseTo(ranked[ranked.length - 1].score, 0.0);
        });
    });

    describe('cosine_similarity', () => {
        it('identical vectors return 1', () => {
            assertCloseTo(cosine_similarity([1, 2, 3], [1, 2, 3]), 1.0);
        });

        it('query vs first two text vectors returns values in [-1, 1]', () => {
            const sim0 = cosine_similarity(dataspace.queryVectors, dataspace.textVectors[0]);
            const sim1 = cosine_similarity(dataspace.queryVectors, dataspace.textVectors[1]);
            assert.ok(sim0 >= -1 && sim0 <= 1);
            assert.ok(sim1 >= -1 && sim1 <= 1);
        });
    });

    describe('cosine_distance', () => {
        it('identical vectors have distance 0', () => {
            assertCloseTo(cosine_distance([1, 0], [1, 0]), 0);
        });

        it('orthogonal vectors have distance 1', () => {
            assertCloseTo(cosine_distance([1, 0], [0, 1]), 1);
        });

        it('query vs text vectors returns non-negative values', () => {
            const cd0 = cosine_distance(dataspace.queryVectors, dataspace.textVectors[0]);
            const cd1 = cosine_distance(dataspace.queryVectors, dataspace.textVectors[1]);
            assert.ok(cd0 >= 0);
            assert.ok(cd1 >= 0);
        });
    });

    describe('euclidean_distance', () => {
        it('known distance (3,4) triangle', () => {
            assertCloseTo(euclidean_distance([0, 0], [3, 4]), 5);
        });

        it('query vs text vectors returns positive values', () => {
            const ed0 = euclidean_distance(dataspace.queryVectors, dataspace.textVectors[0]);
            const ed1 = euclidean_distance(dataspace.queryVectors, dataspace.textVectors[1]);
            assert.ok(ed0 > 0);
            assert.ok(ed1 > 0);
        });
    });

    describe('squared_euclidean_distance', () => {
        it('known squared distance (3,4) triangle', () => {
            assertCloseTo(squared_euclidean_distance([0, 0], [3, 4]), 25);
        });

        it('equals square of euclidean distance for dataspace vectors', () => {
            const ed = euclidean_distance(dataspace.queryVectors, dataspace.textVectors[0]);
            const sed = squared_euclidean_distance(dataspace.queryVectors, dataspace.textVectors[0]);
            assertCloseTo(sed, ed * ed, 4);
        });
    });

    describe('hit_rate', () => {
        it('all within tolerance returns 1', () => {
            assertCloseTo(hit_rate([1, 2, 3], [1.1, 2.1, 3.1], 0.2), 1);
        });

        it('none within tolerance returns 0', () => {
            assertCloseTo(hit_rate([1, 2, 3], [5, 6, 7], 0.1), 0);
        });

        it('increasing tolerance increases hit rate on dataspace vectors', () => {
            const hr01 = hit_rate(dataspace.queryVectors, dataspace.textVectors[0], 0.01);
            const hr10 = hit_rate(dataspace.queryVectors, dataspace.textVectors[0], 0.1);
            assert.ok(hr10 >= hr01);
        });
    });

    describe('overshoot_rate', () => {
        it('all overshoot returns 1', () => {
            assertCloseTo(overshoot_rate([1, 2], [2, 3], 0.5), 1);
        });

        it('no overshoot returns 0', () => {
            assertCloseTo(overshoot_rate([1, 2], [1, 2], 0.5), 0);
        });

        it('query vs text vector returns value in [0, 1]', () => {
            const rate = overshoot_rate(dataspace.queryVectors, dataspace.textVectors[0], 0.05);
            assert.ok(rate >= 0 && rate <= 1);
        });
    });

    describe('jaccard_index', () => {
        it('identical sets return 1', () => {
            assertCloseTo(jaccard_index([1, 2, 3], [1, 2, 3]), 1);
        });

        it('disjoint sets return 0', () => {
            assertCloseTo(jaccard_index([1, 2], [3, 4]), 0);
        });

        it('partial overlap', () => {
            assertCloseTo(jaccard_index([1, 2, 3], [2, 3, 4]), 0.5);
        });

        it('first two text vectors return value in [0, 1]', () => {
            const ji = jaccard_index(dataspace.textVectors[0], dataspace.textVectors[1]);
            assert.ok(ji >= 0 && ji <= 1);
        });
    });
});
