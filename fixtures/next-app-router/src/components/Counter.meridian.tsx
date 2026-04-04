'use client';
import { Component, state } from 'meridian';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment(step: number): void {
    this.count = this.count + step;
  }

  render(): JSX.Element {
    return (
      <button onClick={() => this.increment(1)}>
        Count: {this.count}
      </button>
    );
  }
}
