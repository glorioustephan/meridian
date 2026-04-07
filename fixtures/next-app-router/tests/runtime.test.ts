import { describe, it } from 'vitest';

import { validateNextFixtureRuntime } from './runtime.shared';

describe('Next.js App Router fixture runtime', () => {
  it(
    'boots under next dev, hydrates the Meridian child, and handles interaction',
    async () => {
      await validateNextFixtureRuntime({
        devScript: 'dev:web',
        expectedButtonText: 'Count: 2',
        expectedHeading: 'Meridian Next.js Fixture',
      });
    },
    90_000,
  );
});
