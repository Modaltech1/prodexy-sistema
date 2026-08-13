export function LoadingBlock({ lines = 4 }: { lines?: number }) {
  return <div className="loading-block">{Array.from({ length: lines }).map((_, i) => <div className="skeleton" key={i} />)}</div>;
}
