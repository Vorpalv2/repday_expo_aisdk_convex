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
    activeWorkout: v.optional(v.any()),
    working: v.optional(v.any()),
    focusDraft: v.optional(v.any()),
    restEndsAt: v.optional(v.union(v.number(), v.null())),
    selectedSessionId: v.union(v.string(), v.null()),
    country: v.optional(v.string()),
    timeZone: v.optional(v.string()),
    theme: v.optional(v.union(v.literal('light'), v.literal('dark'), v.literal('cyberpunk'))),
    activityDefaultCollapsed: v.optional(v.boolean()),
    updatedAt: v.number(),
  }).index('by_owner', ['ownerId']),
  activeWorkoutSessions: defineTable({
    ownerId: v.id('users'),
    sessionKey: v.string(),
    activeWorkout: v.any(),
    working: v.any(),
    restEndsAt: v.union(v.number(), v.null()),
    updatedAt: v.number(),
  }).index('by_owner', ['ownerId']),
  activeWorkoutSets: defineTable({
    ownerId: v.id('users'),
    sessionKey: v.string(),
    moveIndex: v.number(),
    setIndex: v.number(),
    weight: v.string(),
    reps: v.string(),
    done: v.boolean(),
  }).index('by_owner_session', ['ownerId', 'sessionKey'])
    .index('by_owner_session_move_set', ['ownerId', 'sessionKey', 'moveIndex', 'setIndex']),
  profilePhotos: defineTable({
    ownerId: v.id('users'),
    storageId: v.id('_storage'),
    updatedAt: v.number(),
  }).index('by_owner', ['ownerId']),
});
