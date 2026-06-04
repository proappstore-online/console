/**
 * Client onboarding — shown the first time a user visits the Services tab.
 * Walks them through: what this is, how billing works, examples of what
 * they can build, and a CTA to top up and get started.
 */

export function ServicesOnboarding({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="max-w-3xl mx-auto space-y-8 py-4">
      {/* Hero */}
      <div className="text-center space-y-3">
        <h2 className="display-font text-3xl font-bold text-[var(--ink)]">Get your app built</h2>
        <p className="text-[var(--muted)] text-lg max-w-xl mx-auto">
          Describe what you want. A developer builds it. You pay per message &mdash; only when they work.
        </p>
      </div>

      {/* How it works */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Step n="1" title="Top up your balance" desc="Add $10+ via Stripe. Your money sits in your account until a developer works. Unused balance stays yours." />
        <Step n="2" title="Hire or post" desc="Browse the developer directory and hire directly, or post a build request describing what you need." />
        <Step n="3" title="Chat & build" desc="You describe, the developer builds. Your messages are free. Each developer message costs their listed rate." />
        <Step n="4" title="Ship & rate" desc="App goes live on your subdomain. You own the code (GitHub). Rate the developer when it's done." />
      </div>

      {/* Pricing examples */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-4">What does it cost?</h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Every developer sets their own rate (typically $0.50&ndash;$2.00 per message). Here are real examples:
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Example title="Simple tool" cost="$15–$30" desc="Timer, calculator, or single-purpose utility" prompts="15–30 messages" />
          <Example title="Small app" cost="$30–$80" desc="Booking system, task board, or portfolio site" prompts="30–80 messages" />
          <Example title="Full product" cost="$80–$200+" desc="Marketplace, social app, or business tool" prompts="80–200+ messages" />
        </div>
      </div>

      {/* What you get */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6">
        <h3 className="display-font text-lg font-bold text-[var(--ink)] mb-3">Every app includes</h3>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <Feature text="Custom subdomain (yourapp.proappstore.online)" />
          <Feature text="Full source code in your GitHub" />
          <Feature text="Database, file storage, auth" />
          <Feature text="Real-time features & push notifications" />
          <Feature text="Auto-deploys on every push" />
          <Feature text="Maps, AI, SMS — full SDK access" />
        </div>
      </div>

      {/* Trust */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Trust title="Transparent" desc="Every message, every file, every charge is visible. No black boxes." />
        <Trust title="You own it" desc="Source code in your GitHub. Leave anytime, keep everything." />
        <Trust title="Pay for work only" desc="No hourly bills. No retainers. Balance charged per developer message." />
      </div>

      {/* CTA */}
      <div className="text-center space-y-3">
        <button type="button" onClick={onDismiss}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-8 py-3 text-sm font-semibold text-white shadow-lg hover:opacity-90">
          Get Started
        </button>
        <p className="text-xs text-[var(--muted)]">
          This guide won&rsquo;t show again. You can always find help in the <a href="https://proappstore.online/services" target="_blank" rel="noopener noreferrer" className="underline text-[var(--accent)]">services page</a>.
        </p>
      </div>
    </div>
  )
}

function Step({ n, title, desc }: { n: string; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--accent)] text-white text-xs font-bold">{n}</span>
        <span className="font-semibold text-[var(--ink)]">{title}</span>
      </div>
      <p className="text-sm text-[var(--muted)]">{desc}</p>
    </div>
  )
}

function Example({ title, cost, desc, prompts }: { title: string; cost: string; desc: string; prompts: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 text-center">
      <p className="font-semibold text-[var(--ink)]">{title}</p>
      <p className="display-font text-xl font-bold text-[var(--accent)] mt-1">{cost}</p>
      <p className="text-xs text-[var(--muted)] mt-1">{desc}</p>
      <p className="text-[10px] text-[var(--muted)] mt-1">{prompts}</p>
    </div>
  )
}

function Feature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[var(--success)] text-xs font-bold">&#10003;</span>
      <span className="text-[var(--ink)]">{text}</span>
    </div>
  )
}

function Trust({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-center">
      <p className="font-semibold text-[var(--ink)] mb-1">{title}</p>
      <p className="text-xs text-[var(--muted)]">{desc}</p>
    </div>
  )
}
