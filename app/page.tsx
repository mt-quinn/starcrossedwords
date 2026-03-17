import Link from "next/link";

export default function HomePage() {
  return (
    <main className="menu-shell">
      <section className="menu-card">
        <p className="menu-eyebrow">Star Crossed Words</p>
        <h1>Choose how you want to play.</h1>
        <p className="menu-copy">
          Start an online room with a shareable code, or run a local turn-based simulation to test both sides of the game.
        </p>

        <div className="menu-actions">
          <Link className="primary-button menu-button" href="/online">
            Play Online
          </Link>
          <Link className="ghost-button menu-button" href="/local">
            Test Local
          </Link>
        </div>
      </section>
    </main>
  );
}
