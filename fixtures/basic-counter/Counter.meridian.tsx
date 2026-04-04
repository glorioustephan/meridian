'use client';
import { Component, state, effect } from 'meridian';
import type React from 'react';

export default class Counter extends Component<{ initial: number }> {
  @state count = this.props.initial;

  increment() {
    this.count = this.count + 1;
  }

  get doubled() {
    return this.count * 2;
  }

  @effect
  logCount() {
    console.log('count changed:', this.count);
  }

  render() {
    return (
      <div>
        <p>Count: {this.count}</p>
        <p>Doubled: {this.doubled}</p>
        <button onClick={() => this.increment()}>+</button>
      </div>
    );
  }
}
