import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

export const getMyData = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return null;

    const [splitRows, historyRows, settings] = await Promise.all([
      ctx.db.query('workoutSplits').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).collect(),
      ctx.db.query('workoutHistory').withIndex('by_owner_and_started_at', (q) => q.eq('ownerId', ownerId)).collect(),
      ctx.db.query('workoutSettings').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).first(),
    ]);

    const user = await ctx.db.get(ownerId);
    return {
      userId: ownerId,
      user: user ? { name: user.name ?? null, email: user.email ?? null } : null,
      initialized: Boolean(settings || splitRows.length || historyRows.length),
      sessions: splitRows.sort((a, b) => a.position - b.position).map((row) => row.data),
      history: historyRows.sort((a, b) => a.startedAt - b.startedAt).map((row) => row.data),
      weeklyPlan: settings?.weeklyPlan ?? {},
      activeWorkout: settings?.activeWorkout ?? null,
      working: settings?.working ?? null,
      focusDraft: settings?.focusDraft ?? null,
      restEndsAt: settings?.restEndsAt ?? null,
      selectedSessionId: settings?.selectedSessionId ?? null,
      country: settings?.country ?? 'India',
      timeZone: settings?.timeZone ?? 'Asia/Kolkata',
      theme: settings?.theme ?? 'light',
    };
  },
});

export const syncSplits = mutation({
  args: { items: v.array(v.any()) },
  handler: async (ctx, { items }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save your workout splits.');
    const current = await ctx.db.query('workoutSplits').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).collect();
    const keep = new Set(items.map((item: any) => String(item.id)));
    for (const row of current) if (!keep.has(row.clientId)) await ctx.db.delete(row._id);
    for (const [position, item] of items.entries()) {
      const clientId = String(item.id);
      const existing = current.find((row) => row.clientId === clientId);
      if (existing) await ctx.db.patch(existing._id, { data: item, position, updatedAt: Date.now() });
      else await ctx.db.insert('workoutSplits', { ownerId, clientId, data: item, position, updatedAt: Date.now() });
    }
  },
});

export const syncHistory = mutation({
  args: { items: v.array(v.any()) },
  handler: async (ctx, { items }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save workout history.');
    const current = await ctx.db.query('workoutHistory').withIndex('by_owner_and_started_at', (q) => q.eq('ownerId', ownerId)).collect();
    for (const item of items) {
      const clientId = String(item.id);
      const existing = current.find((row) => row.clientId === clientId);
      if (existing) await ctx.db.patch(existing._id, { data: item, startedAt: Number(item.startedAt) || 0 });
      else await ctx.db.insert('workoutHistory', { ownerId, clientId, data: item, startedAt: Number(item.startedAt) || 0 });
    }
  },
});

export const deleteHistoryItem = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to manage workout history.');
    const row = await ctx.db
      .query('workoutHistory')
      .withIndex('by_owner_and_client', (q) => q.eq('ownerId', ownerId).eq('clientId', clientId))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

export const saveWorkoutSettings = mutation({
  args: {
    weeklyPlan: v.any(),
    activeWorkout: v.any(),
    working: v.any(),
    focusDraft: v.any(),
    restEndsAt: v.union(v.number(), v.null()),
    selectedSessionId: v.union(v.string(), v.null()),
    country: v.string(),
    timeZone: v.string(),
    theme: v.union(v.literal('light'), v.literal('dark'), v.literal('cyberpunk')),
  },
  handler: async (ctx, data) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save your workout plan.');
    const current = await ctx.db.query('workoutSettings').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).first();
    if (current) await ctx.db.patch(current._id, { ...data, updatedAt: Date.now() });
    else await ctx.db.insert('workoutSettings', { ownerId, ...data, updatedAt: Date.now() });
  },
});
