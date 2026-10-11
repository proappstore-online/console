// Approved app templates offered by the provisioning flow (platform#368).
//
// A pinned snapshot of the approved entries in
// proappstore-online/platform@6328e165d0e6816b8bbb42fe378e0a2000769742:docs/templates/catalogue.json
// (the public copy has no CORS header, so the browser cannot read it live).
// It only fills the picker. The preview (platform#367) validates the choice and
// reports the template and revision it would actually use — always show
// `plan.template`, never anything derived from this list.

export interface ApprovedTemplate {
  id: string
  title: string
  summary: string
}

export const TEMPLATE_CATALOGUE_SOURCE =
  'proappstore-online/platform@6328e165d0e6816b8bbb42fe378e0a2000769742:docs/templates/catalogue.json'

export const APPROVED_TEMPLATES: readonly ApprovedTemplate[] = [
  {
    id: 'template-app',
    title: 'ProAppStore app template',
    summary: 'The canonical Pro app scaffold. Suits any app category.',
  },
  {
    id: 'template-marketplace',
    title: 'Two-sided listings marketplace template',
    summary: 'Owners publish listings, seekers browse, save favourites and send requests.',
  },
]
