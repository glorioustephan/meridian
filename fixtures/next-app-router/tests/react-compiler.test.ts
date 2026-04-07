import { describe, it } from 'vitest';

import {
  validateNextFixtureRuntime,
  validateReactCompilerBuild,
} from './runtime.shared';

describe('Next.js React Compiler validation', () => {
  it(
    'builds the fixture with React Compiler enabled while preserving minimal Meridian output',
    async () => {
      await validateReactCompilerBuild();
    },
    120_000,
  );

  it(
    'boots under next dev with React Compiler enabled, hydrates the Meridian child, and handles interaction',
    async () => {
      await validateNextFixtureRuntime({
        devScript: 'dev:web:compiler',
        expectedButtonText: 'Count: 2',
        expectedHeading: 'Meridian Next.js Fixture',
      });
    },
    120_000,
  );
});
