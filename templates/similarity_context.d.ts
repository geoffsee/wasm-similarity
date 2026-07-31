export class SimilarityContext {
  constructor(dim: number);
  setA(v: Float64Array): void;
  setB(v: Float64Array): void;
  cosineSimilarity(): number;
  cosineDistance(): number;
  euclideanDistance(): number;
  squaredEuclideanDistance(): number;
  free(): void;
}
