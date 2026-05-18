import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { CanonicalStore } from '../src/canonical-store';
import { cosineSimilarity } from '../src/embedding';

let tempDirs: string[] = [];
let openStores: CanonicalStore[] = [];

function freshDir(): string {
  const dir = resolve(
    tmpdir(),
    `omem-embed-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function openStore(dir: string): CanonicalStore {
  const store = CanonicalStore.open({ path: resolve(dir, 'canonical.db') });
  openStores.push(store);
  return store;
}

afterEach(() => {
  for (const s of openStores) {
    try {
      s.close();
    } catch {}
  }
  openStores = [];
  for (const d of tempDirs) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {}
  }
  tempDirs = [];
});

describe('cosineSimilarity', () => {
  test('identical vectors have similarity 1.0', () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0, 5);
  });

  test('orthogonal vectors have similarity 0.0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  test('opposite vectors have similarity -1.0', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  test('similar vectors have high similarity', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2, 3.1]);
    expect(cosineSimilarity(a, b)).toBeGreaterThan(0.99);
  });

  test('zero vector returns 0', () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe('CanonicalStore embedding methods', () => {
  test('storeEmbedding + searchByVector round-trips', () => {
    const dir = freshDir();
    const store = openStore(dir);

    store.remember({ text: 'React hooks tutorial', source: 'test' });
    store.remember({ text: 'Vue composition API guide', source: 'test' });
    store.remember({ text: 'Cooking pasta recipe', source: 'test' });

    const records = store.recall({ query: 'react vue cooking', limit: 10 });
    expect(records.length).toBe(3);

    const vecReact = new Float32Array([0.9, 0.1, 0.05, 0.05]);
    const vecVue = new Float32Array([0.8, 0.2, 0.05, 0.05]);
    const vecCooking = new Float32Array([0.1, 0.1, 0.9, 0.1]);

    store.storeEmbedding(records[0]!.record.id, 'test-model', vecReact);
    store.storeEmbedding(records[1]!.record.id, 'test-model', vecVue);
    store.storeEmbedding(records[2]!.record.id, 'test-model', vecCooking);

    expect(store.countEmbeddings('test-model')).toBe(3);

    const queryVec = new Float32Array([0.85, 0.15, 0.05, 0.05]);
    const hits = store.searchByVector(queryVec, 'test-model', 10);

    expect(hits.length).toBe(3);
    expect(hits[0]!.similarity).toBeGreaterThan(hits[2]!.similarity);
  });

  test('storeEmbedding replaces existing embedding (upsert)', () => {
    const dir = freshDir();
    const store = openStore(dir);

    store.remember({ text: 'test record', source: 'test' });
    const records = store.recall({ query: 'test record', limit: 1 });
    const id = records[0]!.record.id;

    const vec1 = new Float32Array([1, 0, 0]);
    const vec2 = new Float32Array([0, 1, 0]);

    store.storeEmbedding(id, 'model-a', vec1);
    expect(store.countEmbeddings('model-a')).toBe(1);

    store.storeEmbedding(id, 'model-a', vec2);
    expect(store.countEmbeddings('model-a')).toBe(1);

    const hits = store.searchByVector(new Float32Array([0, 1, 0]), 'model-a', 1);
    expect(hits[0]!.similarity).toBeCloseTo(1.0, 3);
  });

  test('unembeddedRecordIds returns IDs without embeddings', () => {
    const dir = freshDir();
    const store = openStore(dir);

    store.remember({ text: 'embedded record', source: 'test' });
    store.remember({ text: 'not embedded record', source: 'test' });

    const allRecords = store.recall({ query: 'embedded record', limit: 10 });
    store.storeEmbedding(allRecords[0]!.record.id, 'model-a', new Float32Array([1, 0]));

    const unembedded = store.unembeddedRecordIds('model-a', 100);
    expect(unembedded.length).toBe(1);
    expect(unembedded[0]).toBe(allRecords[1]!.record.id);
  });

  test('getTexts returns text for given record IDs', () => {
    const dir = freshDir();
    const store = openStore(dir);

    store.remember({ text: 'first text', source: 'test' });
    store.remember({ text: 'second text', source: 'test' });

    const records = store.recall({ query: 'text', limit: 10 });
    const ids = records.map((r) => r.record.id);
    const texts = store.getTexts(ids);

    expect(texts.length).toBe(2);
    const textValues = texts.map((t) => t.text).sort();
    expect(textValues).toEqual(['first text', 'second text']);
  });

  test('searchByVector with different model returns empty', () => {
    const dir = freshDir();
    const store = openStore(dir);

    store.remember({ text: 'test', source: 'test' });
    const records = store.recall({ query: 'test', limit: 1 });
    store.storeEmbedding(records[0]!.record.id, 'model-a', new Float32Array([1, 0, 0]));

    const hits = store.searchByVector(new Float32Array([1, 0, 0]), 'model-b', 10);
    expect(hits.length).toBe(0);
  });

  test('embedding cascade-deletes when memory is pruned', () => {
    const dir = freshDir();
    const store = openStore(dir);

    store.remember({
      text: 'old record',
      source: 'test',
      timestamp: new Date('2020-01-01'),
    });
    const records = store.recall({ query: 'old record', limit: 1 });
    store.storeEmbedding(records[0]!.record.id, 'model-a', new Float32Array([1, 0]));
    expect(store.countEmbeddings()).toBe(1);

    store.prune({ olderThan: new Date('2021-01-01') });
    expect(store.countEmbeddings()).toBe(0);
  });
});
