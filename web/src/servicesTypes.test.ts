import { describe, it, expect } from 'vitest'
import type { DevProfile, Engagement, ServiceMessage, BuildRequest, Balance, Transaction } from './servicesTypes'

/**
 * Type contract tests — verify the interfaces match what the backend returns.
 * These are compile-time checks (TypeScript ensures the shape) plus runtime
 * checks that sample data satisfies the interface.
 */

describe('servicesTypes contracts', () => {
  it('DevProfile has all required fields', () => {
    const profile: DevProfile = {
      creatorId: 'gh:123',
      promptRateCents: 100,
      bioServices: 'I build apps',
      available: true,
      qualityScore: 8.5,
      avgPromptLength: 250,
      completedEngagements: 5,
      avgRating: 4.5,
      ratingCount: 3,
      appCount: 10,
      login: 'testuser',
      avatarUrl: 'https://example.com/avatar.png',
    }
    expect(profile.creatorId).toBe('gh:123')
    expect(profile.promptRateCents).toBe(100)
    expect(profile.available).toBe(true)
  })

  it('DevProfile optional fields can be null/undefined', () => {
    const minimal: DevProfile = {
      creatorId: 'gh:1',
      promptRateCents: 50,
      bioServices: null,
      available: false,
      qualityScore: null,
      avgPromptLength: null,
      completedEngagements: 0,
      avgRating: null,
      ratingCount: 0,
    }
    expect(minimal.appCount).toBeUndefined()
    expect(minimal.login).toBeUndefined()
  })

  it('Engagement has all required fields including new ones', () => {
    const eng: Engagement = {
      id: 'eng-1',
      clientId: 'gh:1',
      clientLogin: 'client',
      developerId: 'gh:2',
      devLogin: 'dev',
      projectSlug: 'my-app',
      buildRequestId: 'req-1',
      status: 'active',
      promptRateCents: 100,
      promptsCount: 5,
      totalChargedCents: 500,
      totalDevEarnedCents: 450,
      totalPlatformFeeCents: 50,
      role: 'client',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    expect(eng.totalDevEarnedCents).toBe(450)
    expect(eng.totalPlatformFeeCents).toBe(50)
    expect(eng.updatedAt).toBeGreaterThan(0)
  })

  it('ServiceMessage includes senderId', () => {
    const msg: ServiceMessage = {
      id: 'msg-1',
      senderRole: 'developer',
      senderId: 'gh:2',
      body: 'Hello, I started working on your app.',
      charged: true,
      chargeCents: 100,
      createdAt: Date.now(),
    }
    expect(msg.senderId).toBe('gh:2')
    expect(msg.charged).toBe(true)
  })

  it('Balance fields match API response shape', () => {
    const bal: Balance = {
      balanceCents: 5000,
      totalDepositedCents: 10000,
      totalSpentCents: 5000,
    }
    expect(bal.balanceCents).toBe(5000)
  })

  it('Transaction has all fields', () => {
    const tx: Transaction = {
      id: 'tx-1',
      type: 'charge',
      amountCents: -100,
      description: 'Dev prompt',
      createdAt: Date.now(),
    }
    expect(tx.amountCents).toBe(-100)
  })

  it('BuildRequest has all fields', () => {
    const req: BuildRequest = {
      id: 'req-1',
      clientLogin: 'tester',
      title: 'Build me an app',
      description: 'A todo list with real-time sync',
      budgetCents: 5000,
      createdAt: Date.now(),
    }
    expect(req.budgetCents).toBe(5000)
  })
})
