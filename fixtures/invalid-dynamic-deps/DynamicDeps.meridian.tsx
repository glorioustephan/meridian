'use client';
import { Component, state, effect } from '@meridian/meridian';

export default class DynamicDeps extends Component<{ keys: string[] }> {
  @state values: Record<string, number> = {};

  @effect
  watchDynamic() {
    // Dynamic access — should trigger M008
    for (const k in (this as unknown as Record<string, unknown>)) {
      console.log(k);
    }
  }

  render() {
    return <div>{JSON.stringify(this.values)}</div>;
  }
}
