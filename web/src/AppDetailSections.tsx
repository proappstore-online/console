/**
 * AppDetail section components — branding/listing/screenshots/developer/social/
 * legal editors, usage + analytics + domains panels, and shared primitives.
 * Extracted from AppDetail.tsx so the orchestrator stays lean.
 *
 * This file is now a thin barrel: the section bodies live in cohesive sibling
 * modules (sectionPrimitives, ListingSections, UsageSection) and are re-exported
 * here so AppDetail's import surface is unchanged.
 */

// Analytics + Domains sections live in their own files; re-export them so
// AppDetail's import surface is unchanged.
export { AnalyticsSection } from './AnalyticsSection'
export { DomainsSection } from './DomainsSection'

// Shared primitives + storefront preview bits.
export {
  Kpi,
  Preview,
  StorefrontTile,
  type SaveState,
} from './sectionPrimitives'

// Listing-editor sections.
export {
  BrandingSection,
  ListingCopySection,
  ScreenshotsSection,
  DeveloperSection,
  SocialSection,
  LegalSection,
} from './ListingSections'

// Usage analytics section.
export { UsageSection, UsageSkeleton } from './UsageSection'
