'use client';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main id="main" className="cz-container cz-section">
      <div className="cz-card cz-state" role="alert">
        <h1>Something went wrong</h1>
        <p>The error has been logged. Please try again.</p>
        <button className="cz-btn cz-btn-primary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
