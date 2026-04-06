---
layout: home

hero:
  name: Meridian
  text: Write React components as classes.
  tagline: A compile-time authoring layer that lowers TypeScript class syntax to standard React hooks — no runtime overhead, no Proxy magic.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/introduction
    - theme: alt
      text: View on GitHub
      link: https://github.com/meridian-js/meridian

features:
  - icon: 🏗️
    title: Class-shaped authoring
    details: Write components and reusable logic as TypeScript classes with decorators. No hooks, no dependency arrays.
  - icon: ⚡
    title: Compile-time lowering
    details: The Meridian compiler transforms your classes into standard React function components before your bundler runs.
  - icon: 🔍
    title: Static dependency inference
    details: Effect dependencies are inferred at compile time. Dynamic access is a build error, not a runtime bug.
  - icon: 🔌
    title: Next.js native
    details: Generated code is plain React. Drop it into Next.js App Router alongside Server Components.
---
