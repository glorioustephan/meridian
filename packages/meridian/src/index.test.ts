import { describe, it, expect } from 'vitest';
import { state, ref, effect, use, Primitive } from './index.js';
import { UNCOMPILED_ERROR } from './errors.js';

describe('marker decorators throw the uncompiled error', () => {
  it('state throws when called directly', () => {
    expect(() =>
      state(undefined, {} as ClassFieldDecoratorContext),
    ).toThrowError(UNCOMPILED_ERROR);
  });

  it('ref throws when called directly', () => {
    expect(() =>
      ref(undefined, {} as ClassFieldDecoratorContext),
    ).toThrowError(UNCOMPILED_ERROR);
  });

  it('effect throws when called directly', () => {
    expect(() =>
      effect(() => {}, {} as ClassMethodDecoratorContext),
    ).toThrowError(UNCOMPILED_ERROR);
  });

  it('effect.layout throws when called directly', () => {
    expect(() =>
      effect.layout(() => {}, {} as ClassMethodDecoratorContext),
    ).toThrowError(UNCOMPILED_ERROR);
  });

  it('use returns a field decorator that throws when called', () => {
    class CountPrimitive extends Primitive<number> {
      constructor(readonly initial: number) {
        super();
      }
      resolve(): number {
        return this.initial;
      }
    }

    const decorator = use(CountPrimitive, () => [0]);

    expect(() =>
      decorator(undefined, {} as ClassFieldDecoratorContext),
    ).toThrowError(UNCOMPILED_ERROR);
  });
});
