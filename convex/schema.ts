import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  ...authTables,
  workoutSplits: defineTable({
    ownerId: v.id('users'),
    clientId: v.string(),
    data: v.any(),
    position: v.number(),
    updatedAt: v.number(),
  }).index('by_owner_and_client', ['ownerId', 'clientId']).index('by_owner', ['ownerId']),
  workoutHistory: defineTable({
    ownerId: v.id('users'),
    clientId: v.string(),
    data: v.any(),
    startedAt: v.number(),
  }).index('by_owner_and_client', ['ownerId', 'clientId']).index('by_owner_and_started_at', ['ownerId', 'startedAt']),
  workoutSettings: defineTable({
    ownerId: v.id('users'),
    weeklyPlan: v.any(),
    activeWorkout: v.any(),
    working: v.any(),
    restEndsAt: v.union(v.number(), v.null()),
    selectedSessionId: v.union(v.string(), v.null()),
    country: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    updatedAt: v.number(),
  }).index('by_owner', ['ownerId']),
});
