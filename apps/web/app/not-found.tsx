import Link from 'next/link';
export default function NotFound() {
  return (
    <main id="main" className="cz-container cz-section">
      <div className="cz-card cz-state">
        <h1>Page not found</h1>
        <p>The page you requested does not exist or you may not have access to it.</p>
        <Link href="/" className="cz-btn cz-btn-primary">Back to COLLABIZ</Link>
      </div>
    </main>
  );
}
