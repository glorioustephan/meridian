'use client';
import { Component, state } from '@meridian/meridian';

export default class PrivateReactive extends Component {
  @state #count = 0;

  render() {
    return <div>{this.#count}</div>;
  }
}
