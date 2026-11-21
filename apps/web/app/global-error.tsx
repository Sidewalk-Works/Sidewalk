"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main className="page" style={{ padding: "48px 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: "32px", color: "#0f172a", marginBottom: "8px" }}>Something went wrong</h1>
          <p style={{ color: "#475569", marginBottom: "16px" }}>
            An unexpected error occurred. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 16px",
              background: "#2563eb",
              color: "#ffffff",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
