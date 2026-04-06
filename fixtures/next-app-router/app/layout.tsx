import type { ReactNode } from 'react';

export const metadata = {
  title: 'Meridian Next App Router Fixture',
  description: 'Verifies Meridian-generated client components inside a Next.js App Router server tree.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
