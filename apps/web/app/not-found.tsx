import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page" style={{ padding: "48px 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: "32px", color: "#0f172a", marginBottom: "8px" }}>Page not found</h1>
      <p style={{ color: "#475569", marginBottom: "16px" }}>
        The page you requested could not be found.
      </p>
      <Link href="/" style={{ color: "#2563eb", textDecoration: "underline" }}>
        Go back home
      </Link>
    </div>
  );
}
