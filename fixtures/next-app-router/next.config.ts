import type { NextConfig } from 'next';

const nextConfig: NextConfig =
  process.env.MERIDIAN_REACT_COMPILER === '1'
    ? {
        reactCompiler: true,
      }
    : {};

export default nextConfig;
