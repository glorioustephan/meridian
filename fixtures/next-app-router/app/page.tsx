import Counter from '../.meridian/generated/components/Counter.meridian';

export default function Page(): JSX.Element {
  return (
    <main>
      <h1>Meridian Next.js Fixture</h1>
      <Counter initial={2} />
    </main>
  );
}
