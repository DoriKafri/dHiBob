"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#f9fafb' }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', fontSize: 14 }}>{error.message || "An unexpected error occurred."}</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: '8px 16px', fontSize: 14, fontWeight: 500, background: '#E33054', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
