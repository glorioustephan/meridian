import { defineConfig } from 'vitepress';

const repository = process.env.GITHUB_REPOSITORY ?? 'glorioustephan/meridian';
const [repoOwner = 'glorioustephan', repoName = 'meridian'] = repository.split('/');
const repositoryUrl = `https://github.com/${repoOwner}/${repoName}`;

export default defineConfig({
  title: 'Meridian',
  description:
    'A compile-time authoring layer for React — write hooks as classes.',
  base: `/${repoName}/`,

  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide/introduction' },
      { text: 'API', link: '/api/component' },
      { text: 'Examples', link: '/examples/counter' },
      { text: 'Development', link: '/development/' },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/guide/introduction' },
          { text: 'Installation', link: '/guide/installation' },
          { text: 'Quick Start', link: '/guide/quick-start' },
        ],
      },
      {
        text: 'Guide',
        items: [
          { text: 'Why Meridian', link: '/guide/why-meridian' },
          { text: 'Components', link: '/guide/components' },
          { text: 'Primitives', link: '/guide/primitives' },
          { text: 'Effects & Dependencies', link: '/guide/effects' },
          { text: 'Next.js Integration', link: '/guide/nextjs' },
          { text: 'React Compiler', link: '/guide/react-compiler' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Component<Props>', link: '/api/component' },
          { text: 'Primitive<T>', link: '/api/primitive' },
          { text: '@state', link: '/api/state' },
          { text: '@ref', link: '/api/ref' },
          { text: '@effect', link: '/api/effect' },
          { text: '@use', link: '/api/use' },
          { text: 'Compiler API', link: '/api/compiler' },
          { text: 'CLI Reference', link: '/api/cli' },
          { text: 'Diagnostics', link: '/api/diagnostics' },
        ],
      },
      {
        text: 'Examples',
        items: [
          { text: 'Counter', link: '/examples/counter' },
          { text: 'Debounce Primitive', link: '/examples/debounce' },
          { text: 'Search Box', link: '/examples/search-box' },
          { text: 'Next.js App Router', link: '/examples/nextjs-app-router' },
        ],
      },
      {
        text: 'Development',
        items: [
          { text: 'Overview', link: '/development/' },
          { text: 'Phase 3 Completion', link: '/development/phase-3-strict-mode' },
          { text: 'Phase 6 Completion', link: '/development/phase-6-cli-watch' },
          { text: 'Phase 7 Completion', link: '/development/phase-7-next-runtime' },
          { text: 'Phase 8', link: '/development/phase-8-react-compiler' },
          { text: 'Phase 9', link: '/development/phase-9-release' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: repositoryUrl },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Meridian Contributors',
    },

    editLink: {
      pattern: `${repositoryUrl}/edit/main/docs/:path`,
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },
  },
});
