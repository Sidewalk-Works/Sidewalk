import Link from "next/link";
import { Wordmark } from "./wordmark";

const cols = [
  {
    title: "Explore",
    links: [
      { href: "/issues", label: "All public reports" },
      { href: "/issues?view=map", label: "Map of reports" },
      { href: "/report", label: "Report an issue" }
    ]
  },
  {
    title: "Learn",
    links: [
      { href: "/how-it-works", label: "How reporting works" },
      { href: "/accountability", label: "How we handle trust" },
      { href: "/guidelines", label: "Community guidelines" }
    ]
  },
  {
    title: "Your account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/register", label: "Create an account" },
      { href: "/dashboard", label: "My reports" }
    ]
  },
  {
    title: "The small print",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/credits", label: "Photo credits" }
    ]
  }
];

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t-2 border-ink bg-ink text-paper">
      <div className="wrap py-14">
        <div className="grid gap-12 lg:grid-cols-[1.3fr_2fr]">
          <div>
            <Wordmark className="text-paper [&_path:last-child]:stroke-[#e8825b]" />
            <p className="mt-5 max-w-sm text-[0.975rem] leading-relaxed text-paper/80">
              Sidewalk is an independent platform where residents report public problems, follow
              what happens next, and keep a public record of what was said and what was proven.
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-4">
            {cols.map((c) => (
              <div key={c.title}>
                <h2 className="eyebrow !font-sans !text-paper/65">{c.title}</h2>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        className="underline decoration-paper/30 underline-offset-4 hover:decoration-paper"
                      >
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-paper/20 pt-6 text-[0.875rem] text-paper/70 md:flex-row md:justify-between">
          <p>
            Sidewalk is not a government service. No agency has endorsed or verified this platform.
          </p>
          <p>Map data © OpenStreetMap contributors.</p>
        </div>
      </div>
    </footer>
  );
}
