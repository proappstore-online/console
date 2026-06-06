/**
 * AppDetail listing-editor sections — branding, listing copy, screenshots,
 * developer, social, and legal editors. Extracted from AppDetailSections.tsx.
 */

import { useState, useRef } from 'react'
import { uploadAsset, CATEGORIES } from './listings'
import {
  Section,
  useSection,
  Row,
  ColorInput,
  PrefixedInput,
  Preview,
  type SectionProps,
} from './sectionPrimitives'

export function DeveloperSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'websiteUrl', 'supportEmail', 'supportUrl',
  ])
  return (
    <Section title="Developer" hint="How people get in touch when something breaks." state={state} onSave={save}>
      <Row label="Website">
        <input
          type="url"
          value={draft.websiteUrl ?? ''}
          onChange={(e) => set('websiteUrl', e.target.value || null)}
          placeholder="https://your-company.com"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Support email">
        <input
          type="email"
          value={draft.supportEmail ?? ''}
          onChange={(e) => set('supportEmail', e.target.value || null)}
          placeholder="support@your-company.com"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Support URL" hint="A help center or contact page. Optional if you've set a support email.">
        <input
          type="url"
          value={draft.supportUrl ?? ''}
          onChange={(e) => set('supportUrl', e.target.value || null)}
          placeholder="https://help.your-company.com"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
    </Section>
  )
}

export function SocialSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'socialTwitter', 'socialGithub', 'socialMastodon', 'socialBluesky',
  ])
  return (
    <Section title="Social" hint="Linked from the storefront listing footer." state={state} onSave={save}>
      <Row label="X / Twitter handle">
        <PrefixedInput
          prefix="@"
          value={draft.socialTwitter ?? ''}
          onChange={(v) => set('socialTwitter', v || null)}
          placeholder="yourhandle"
        />
      </Row>
      <Row label="GitHub handle">
        <PrefixedInput
          prefix="github.com/"
          value={draft.socialGithub ?? ''}
          onChange={(v) => set('socialGithub', v || null)}
          placeholder="yourname"
        />
      </Row>
      <Row label="Mastodon URL">
        <input
          type="url"
          value={draft.socialMastodon ?? ''}
          onChange={(e) => set('socialMastodon', e.target.value || null)}
          placeholder="https://mastodon.social/@you"
          className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
        />
      </Row>
      <Row label="Bluesky handle">
        <PrefixedInput
          prefix="@"
          value={draft.socialBluesky ?? ''}
          onChange={(v) => set('socialBluesky', v || null)}
          placeholder="you.bsky.social"
        />
      </Row>
    </Section>
  )
}

export function LegalSection({ appId, listing, update, getToken }: SectionProps) {
  const { state, draft, set, save } = useSection(appId, listing, update, getToken, [
    'privacyPolicyUrl', 'termsUrl',
  ])
  const privacyRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<'privacy' | 'terms' | null>(null)
  // Probe results: undefined = not yet probed, true = file responded 200, false = 404/other.
  const [repoProbe, setRepoProbe] = useState<{ privacy?: boolean; terms?: boolean }>({})

  async function uploadMd(kind: 'privacy-policy' | 'terms', file: File) {
    const token = getToken()
    if (!token) return
    setBusy(kind === 'privacy-policy' ? 'privacy' : 'terms')
    try {
      const blob = new Blob([await file.text()], { type: 'text/markdown' })
      const { url } = await uploadAsset(token, appId, kind, blob)
      if (kind === 'privacy-policy') set('privacyPolicyUrl', url)
      else set('termsUrl', url)
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  // Set the URL to the app's own subdomain (CF Pages serves web/public/<file>),
  // then HEAD-probe to surface a friendly warning when the file is missing.
  async function applyRepoFile(kind: 'privacy' | 'terms') {
    const file = kind === 'privacy' ? 'privacy.md' : 'terms.md'
    const url = `https://${appId}.proappstore.online/${file}`
    if (kind === 'privacy') set('privacyPolicyUrl', url)
    else set('termsUrl', url)
    try {
      const res = await fetch(url, { method: 'HEAD' })
      setRepoProbe((prev) => ({ ...prev, [kind]: res.ok }))
    } catch {
      setRepoProbe((prev) => ({ ...prev, [kind]: false }))
    }
  }

  const PLATFORM_PRIVACY = 'https://proappstore.online/privacy'
  const PLATFORM_TERMS = 'https://proappstore.online/terms'
  const TEMPLATE = 'https://proappstore.online/privacy-template'

  return (
    <Section
      title="Legal"
      hint={
        <>
          The platform's <a href={PLATFORM_PRIVACY} target="_blank" rel="noopener noreferrer" className="underline">privacy policy</a> and <a href={PLATFORM_TERMS} target="_blank" rel="noopener noreferrer" className="underline">terms</a> already cover standard platform behavior (auth, billing, storage, usage analytics, deletion). Link to those if your app doesn't add anything app-specific; otherwise <a href={TEMPLATE} target="_blank" rel="noopener noreferrer" className="underline">copy the template</a> and host or upload your own.
        </>
      }
      state={state}
      onSave={save}
    >
      <Row label="Privacy policy">
        <div className="flex flex-col gap-2">
          <input
            type="url"
            value={draft.privacyPolicyUrl ?? ''}
            onChange={(e) => set('privacyPolicyUrl', e.target.value || null)}
            placeholder="https://your-site.com/privacy"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <input
            ref={privacyRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMd('privacy-policy', f) }}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            <button type="button"
              onClick={() => applyRepoFile('privacy')}
              className="hover:text-[var(--ink)] underline"
            >
              Use privacy.md from my app
            </button>
            <span>·</span>
            <button type="button"
              onClick={() => set('privacyPolicyUrl', PLATFORM_PRIVACY)}
              className="hover:text-[var(--ink)] underline"
            >
              Use the platform policy
            </button>
            <span>·</span>
            <a href={TEMPLATE} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--ink)] underline">
              Copy the template
            </a>
            <span>·</span>
            <button type="button"
              onClick={() => privacyRef.current?.click()}
              disabled={busy === 'privacy'}
              className="hover:text-[var(--ink)] underline"
            >
              {busy === 'privacy' ? 'Uploading…' : 'Upload privacy.md'}
            </button>
          </div>
          {repoProbe.privacy === false && (
            <p className="text-xs text-[var(--warning)]">
              {`No privacy.md found at https://${appId}.proappstore.online/privacy.md yet. Commit `}
              <code className="font-mono">web/public/privacy.md</code>
              {` to your app repo and push — CF Pages will serve it.`}
            </p>
          )}
          {repoProbe.privacy === true && (
            <p className="text-xs text-[var(--success)]">Looks good — the file responds 200.</p>
          )}
        </div>
      </Row>
      <Row label="Terms of service">
        <div className="flex flex-col gap-2">
          <input
            type="url"
            value={draft.termsUrl ?? ''}
            onChange={(e) => set('termsUrl', e.target.value || null)}
            placeholder="https://your-site.com/terms"
            className="w-full rounded-lg border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-sm"
          />
          <input
            ref={termsRef}
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadMd('terms', f) }}
          />
          <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted)]">
            <button type="button"
              onClick={() => applyRepoFile('terms')}
              className="hover:text-[var(--ink)] underline"
            >
              Use terms.md from my app
            </button>
            <span>·</span>
            <button type="button"
              onClick={() => set('termsUrl', PLATFORM_TERMS)}
              className="hover:text-[var(--ink)] underline"
            >
              Use the platform terms
            </button>
            <span>·</span>
            <button type="button"
              onClick={() => termsRef.current?.click()}
              disabled={busy === 'terms'}
              className="hover:text-[var(--ink)] underline"
            >
              {busy === 'terms' ? 'Uploading…' : 'Upload terms.md'}
            </button>
          </div>
          {repoProbe.terms === false && (
            <p className="text-xs text-[var(--warning)]">
              {`No terms.md found at https://${appId}.proappstore.online/terms.md yet. Commit `}
              <code className="font-mono">web/public/terms.md</code>
              {` to your app repo and push.`}
            </p>
          )}
          {repoProbe.terms === true && (
            <p className="text-xs text-[var(--success)]">Looks good — the file responds 200.</p>
          )}
        </div>
      </Row>
    </Section>
  )
}
