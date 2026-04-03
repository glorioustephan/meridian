'use client';
import { Primitive, state, effect } from '@meridian/meridian';

export class Debounce extends Primitive<string> {
  constructor(private value: string, private delay: number) {
    super();
  }

  @state debouncedValue = '';

  @effect
  syncDebounce() {
    const timer = setTimeout(() => {
      this.debouncedValue = this.value;
    }, this.delay);
    return () => clearTimeout(timer);
  }

  resolve() {
    return this.debouncedValue;
  }
}
