import { describe, it, expect } from 'vitest';
import { analyzeDeps, flattenDeps } from './deps.js';
import type { ClassContext, ResolvedDep } from './deps.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCtx(overrides: Partial<ClassContext> = {}): ClassContext {
  return {
    stateFields: new Set(),
    propNames: new Set(),
    getterNames: new Set(),
    getterBodies: new Map(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Simple state dep
// ---------------------------------------------------------------------------

describe('analyzeDeps', () => {
  it('Test 1: detects a simple state dep', () => {
    const ctx = makeCtx({ stateFields: new Set(['count']) });
    const result = analyzeDeps('{ console.log(this.count); }', ctx);

    expect(result.hasDynamicAccess).toBe(false);
    expect(result.deps).toEqual<ResolvedDep[]>([
      { source: 'state', name: 'count' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Test 2: Prop dep via this.props.X
  // -------------------------------------------------------------------------

  it('Test 2: detects a prop dep via this.props.title', () => {
    const ctx = makeCtx({ propNames: new Set(['title']) });
    const result = analyzeDeps(
      '{ document.title = this.props.title; }',
      ctx,
    );

    expect(result.hasDynamicAccess).toBe(false);
    expect(result.deps).toEqual<ResolvedDep[]>([
      { source: 'prop', name: 'title' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Test 3: Getter dep flattening
  // -------------------------------------------------------------------------

  it('Test 3: getter dep flattens to concrete state deps', () => {
    const ctx = makeCtx({
      stateFields: new Set(['count']),
      getterNames: new Set(['doubled']),
      getterBodies: new Map([['doubled', '{ return this.count * 2; }']]),
    });

    const { deps } = analyzeDeps('{ console.log(this.doubled); }', ctx);
    // deps at this stage includes the getter dep
    expect(deps).toEqual<ResolvedDep[]>([{ source: 'getter', name: 'doubled' }]);

    const flat = flattenDeps(deps, ctx);
    expect(flat).toEqual<ResolvedDep[]>([{ source: 'state', name: 'count' }]);
  });

  // -------------------------------------------------------------------------
  // Test 4: Dynamic access detection — this[key]
  // -------------------------------------------------------------------------

  it('Test 4: computed member access on this sets hasDynamicAccess', () => {
    const ctx = makeCtx();
    const result = analyzeDeps('{ const x = this[someKey]; }', ctx);

    expect(result.hasDynamicAccess).toBe(true);
  });

  it('Test 4b: for-in loop over this sets hasDynamicAccess', () => {
    const ctx = makeCtx();
    const result = analyzeDeps(
      '{ for (const k in this) { console.log(k); } }',
      ctx,
    );

    expect(result.hasDynamicAccess).toBe(true);
  });

  it('Test 4c: Object.keys(this) sets hasDynamicAccess', () => {
    const ctx = makeCtx();
    const result = analyzeDeps('{ Object.keys(this); }', ctx);

    expect(result.hasDynamicAccess).toBe(true);
  });

  it('Test 4d: Object.values(this) sets hasDynamicAccess', () => {
    const ctx = makeCtx();
    const result = analyzeDeps('{ Object.values(this); }', ctx);

    expect(result.hasDynamicAccess).toBe(true);
  });

  it('Test 4e: Object.entries(this) sets hasDynamicAccess', () => {
    const ctx = makeCtx();
    const result = analyzeDeps('{ Object.entries(this); }', ctx);

    expect(result.hasDynamicAccess).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 5: Circular getter dependency — does not infinite-loop
  // -------------------------------------------------------------------------

  it('Test 5: circular getter deps do not infinite-loop and return empty', () => {
    const ctx = makeCtx({
      getterNames: new Set(['a', 'b']),
      getterBodies: new Map([
        ['a', '{ return this.b; }'],
        ['b', '{ return this.a; }'],
      ]),
    });

    const { deps } = analyzeDeps('{ return this.a; }', ctx);
    // Should not throw and should produce an empty flat result (circular, no concrete deps)
    expect(() => flattenDeps(deps, ctx)).not.toThrow();
    const flat = flattenDeps(deps, ctx);
    expect(flat).toEqual<ResolvedDep[]>([]);
  });

  // -------------------------------------------------------------------------
  // Test 6: Deduplication
  // -------------------------------------------------------------------------

  it('Test 6: multiple references to same state field produce only one dep', () => {
    const ctx = makeCtx({ stateFields: new Set(['count']) });
    const result = analyzeDeps(
      '{ console.log(this.count); console.log(this.count + 1); return this.count; }',
      ctx,
    );

    expect(result.deps).toHaveLength(1);
    expect(result.deps[0]).toEqual<ResolvedDep>({ source: 'state', name: 'count' });
  });

  // -------------------------------------------------------------------------
  // Additional: bare this.props (no further property access)
  // -------------------------------------------------------------------------

  it('bare this.props access emits __all__ prop dep', () => {
    const ctx = makeCtx();
    const result = analyzeDeps('{ console.log(this.props); }', ctx);

    expect(result.deps).toEqual<ResolvedDep[]>([
      { source: 'prop', name: '__all__' },
    ]);
  });

  // -------------------------------------------------------------------------
  // Additional: mixed state and prop deps
  // -------------------------------------------------------------------------

  it('mixed state and prop deps are both captured', () => {
    const ctx = makeCtx({
      stateFields: new Set(['count']),
      propNames: new Set(['label']),
    });
    const result = analyzeDeps(
      '{ console.log(this.count, this.props.label); }',
      ctx,
    );

    expect(result.deps).toContainEqual<ResolvedDep>({ source: 'state', name: 'count' });
    expect(result.deps).toContainEqual<ResolvedDep>({ source: 'prop', name: 'label' });
    expect(result.hasDynamicAccess).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Additional: flattenDeps deduplicates across getter expansion
  // -------------------------------------------------------------------------

  it('flattenDeps deduplicates when multiple getters share a state dep', () => {
    const ctx = makeCtx({
      stateFields: new Set(['count']),
      getterNames: new Set(['a', 'b']),
      getterBodies: new Map([
        ['a', '{ return this.count; }'],
        ['b', '{ return this.count * 2; }'],
      ]),
    });

    const deps: ResolvedDep[] = [
      { source: 'getter', name: 'a' },
      { source: 'getter', name: 'b' },
    ];
    const flat = flattenDeps(deps, ctx);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toEqual<ResolvedDep>({ source: 'state', name: 'count' });
  });

  // -------------------------------------------------------------------------
  // Additional: unknown this.xxx is not added as a dep
  // -------------------------------------------------------------------------

  it('unknown this.xxx member is not added as a dep', () => {
    const ctx = makeCtx({ stateFields: new Set(['count']) });
    const result = analyzeDeps('{ console.log(this.unknownThing); }', ctx);

    expect(result.deps).toEqual<ResolvedDep[]>([]);
    expect(result.hasDynamicAccess).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Additional: no deps when body has no this references
  // -------------------------------------------------------------------------

  it('body with no this references produces empty deps', () => {
    const ctx = makeCtx({ stateFields: new Set(['count']) });
    const result = analyzeDeps('{ console.log("hello"); }', ctx);

    expect(result.deps).toEqual<ResolvedDep[]>([]);
    expect(result.hasDynamicAccess).toBe(false);
  });
});
