import { useState } from 'react'
import { initPro } from '@proappstore/sdk'
import {
  Avatar,
  SignInButton,
  ThemeToggle,
  ProBadge,
  ProfileMenu,
  SubscriptionStatus,
  UpgradeCard,
  BillingButton,
  GateScreen,
  ProProfilePage,
} from '@proappstore/sdk/ui'

const demo = initPro({ appId: 'console' })

const mockUser = {
  id: 'demo-1',
  login: 'serge-ivo',
  avatarUrl: 'https://github.com/serge-ivo.png',
  dateOfBirth: null,
}

const mockUserNoAvatar = {
  id: 'demo-2',
  login: 'jane-dev',
  avatarUrl: null,
  dateOfBirth: null,
}

export function UILibraryView() {
  const [gateState, setGateState] = useState<'loading' | 'signed-out' | 'no-subscription'>('signed-out')

  return (
    <div className="space-y-10">
      <div>
        <h2 className="display-font text-2xl font-bold text-[var(--ink)]">UI Component Library</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Live preview of all <code className="text-xs bg-[var(--panel)] px-1.5 py-0.5 rounded">@proappstore/sdk/ui</code> components.
        </p>
      </div>

      {/* Avatar */}
      <Section title="Avatar" importPath="import { Avatar } from '@proappstore/sdk/ui'">
        <Row label="With avatar URL">
          <Avatar user={mockUser} size={32} />
          <Avatar user={mockUser} size={48} />
          <Avatar user={mockUser} size={64} />
        </Row>
        <Row label="Fallback (no avatar)">
          <Avatar user={mockUserNoAvatar} size={32} />
          <Avatar user={mockUserNoAvatar} size={48} />
          <Avatar user={null} size={32} />
        </Row>
      </Section>

      {/* ProBadge */}
      <Section title="ProBadge" importPath="import { ProBadge } from '@proappstore/sdk/ui'">
        <Row label="Sizes">
          <ProBadge size="sm" />
          <ProBadge size="md" />
          <ProBadge size="lg" />
        </Row>
      </Section>

      {/* ThemeToggle */}
      <Section title="ThemeToggle" importPath="import { ThemeToggle } from '@proappstore/sdk/ui'">
        <Row label="Interactive">
          <ThemeToggle />
          <span className="text-xs text-[var(--muted)]">Click to cycle: system, light, dark</span>
        </Row>
      </Section>

      {/* SignInButton */}
      <Section title="SignInButton" importPath="import { SignInButton } from '@proappstore/sdk/ui'">
        <Row label="Default">
          <SignInButton app={demo} />
        </Row>
        <Row label="Custom label">
          <SignInButton app={demo} label="Get started" />
        </Row>
      </Section>

      {/* ProfileMenu */}
      <Section title="ProfileMenu" importPath="import { ProfileMenu } from '@proappstore/sdk/ui'">
        <Row label="Live (requires sign-in)">
          <ProfileMenu app={demo} />
          <span className="text-xs text-[var(--muted)]">Sign in to see the avatar dropdown</span>
        </Row>
      </Section>

      {/* SubscriptionStatus */}
      <Section title="SubscriptionStatus" importPath="import { SubscriptionStatus } from '@proappstore/sdk/ui'">
        <Row label="Live (requires sign-in)">
          <SubscriptionStatus app={demo} />
        </Row>
      </Section>

      {/* BillingButton */}
      <Section title="BillingButton" importPath="import { BillingButton } from '@proappstore/sdk/ui'">
        <Row label="Variants">
          <BillingButton app={demo} variant="primary" />
          <BillingButton app={demo} variant="secondary" />
          <BillingButton app={demo} variant="ghost" />
        </Row>
      </Section>

      {/* UpgradeCard */}
      <Section title="UpgradeCard" importPath="import { UpgradeCard } from '@proappstore/sdk/ui'">
        <Row label="Default">
          <UpgradeCard app={demo} />
        </Row>
        <Row label="Custom">
          <UpgradeCard
            app={demo}
            title="Go Pro"
            description="Unlock everything."
            priceLabel="$9/month"
            features={['Cloud sync', 'AI features', 'Priority support']}
          />
        </Row>
      </Section>

      {/* GateScreen */}
      <Section title="GateScreen" importPath="import { GateScreen } from '@proappstore/sdk/ui'">
        <div className="flex gap-2 mb-3">
          {(['loading', 'signed-out', 'no-subscription'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setGateState(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
                gateState === s
                  ? 'bg-[var(--accent)] text-white'
                  : 'border border-[var(--line-strong)] text-[var(--muted)]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="border border-[var(--line)] rounded-xl overflow-hidden" style={{ height: 300 }}>
          <div style={{ transform: 'scale(0.6)', transformOrigin: 'top left', width: '166.67%', height: '166.67%' }}>
            <GateScreen gate={gateState} app={demo} appName="Demo App" />
          </div>
        </div>
      </Section>

      {/* ProProfilePage */}
      <Section title="ProProfilePage" importPath="import { ProProfilePage } from '@proappstore/sdk/ui'">
        <div className="border border-[var(--line)] rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
          <ProProfilePage app={demo} />
        </div>
      </Section>
    </div>
  )
}

function Section({ title, importPath, children }: { title: string; importPath: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--line)]">
        <h3 className="text-lg font-bold text-[var(--ink)]">{title}</h3>
        <code className="text-xs text-[var(--muted)] font-mono">{importPath}</code>
      </div>
      <div className="px-5 py-4 space-y-4">
        {children}
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--muted)] uppercase tracking-wide mb-2">{label}</p>
      <div className="flex items-center gap-3 flex-wrap">
        {children}
      </div>
    </div>
  )
}
