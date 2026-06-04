export interface DevProfile {
  creatorId: string
  promptRateCents: number
  bioServices: string | null
  available: boolean
  qualityScore: number | null
  avgPromptLength: number | null
  completedEngagements: number
  avgRating: number | null
  ratingCount: number
  appCount?: number
  login?: string
  avatarUrl?: string
}

export interface Balance {
  balanceCents: number
  totalDepositedCents: number
  totalSpentCents: number
}

export interface Transaction {
  id: string
  type: string
  amountCents: number
  description: string | null
  createdAt: number
}

export interface Engagement {
  id: string
  clientId: string
  clientLogin: string | null
  developerId: string
  devLogin: string | null
  status: string
  promptRateCents: number
  promptsCount: number
  totalChargedCents: number
  role: 'client' | 'developer'
  createdAt: number
}

export interface ServiceMessage {
  id: string
  senderRole: string
  body: string
  charged: boolean
  chargeCents: number
  createdAt: number
}

export interface BuildRequest {
  id: string
  clientLogin: string
  title: string
  description: string
  budgetCents: number | null
  createdAt: number
}
