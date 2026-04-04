'use client';
import { Component } from 'meridian';

class Base extends Component {
  render() { return null; }
}

// This would be decorated inheritance — extending Base which extends Component
export default class Child extends Base {
  render() { return null; }
}
