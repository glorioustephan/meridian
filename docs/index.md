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
      link: https://github.com/glorioustephan/meridian

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

## Start Here

Meridian is a compile-time authoring layer for React. You write TypeScript classes with decorators such as `@state`, `@effect`, and `@use`, and the compiler lowers them to standard React function components and hooks before your bundler runs.

- [Introduction](/guide/introduction)
- [Installation](/guide/installation)
- [Quick Start](/guide/quick-start)
- [Component API](/api/component)
- [Implementation Plan](/development/)

## What Meridian Is

- A class-shaped authoring model for client React components
- A compile-time transform, not a runtime state system
- A constrained v1 that targets React 19 and Next.js App Router

## What Meridian Is Not

- A replacement for React runtime semantics
- A custom server-component framework
- A proxy-based reactivity system

> If this page is rendering as a plain GitHub Pages/Jekyll document instead of the full Meridian docs UI, the repository Pages source is still publishing the raw `docs/` folder. The intended configuration is **GitHub Pages -> Source -> GitHub Actions** so the deployed VitePress build artifact is served instead.
