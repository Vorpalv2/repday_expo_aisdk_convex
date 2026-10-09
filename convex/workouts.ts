import { getAuthUserId } from '@convex-dev/auth/server';
import { paginationOptsValidator } from 'convex/server';
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
      activityDefaultCollapsed: settings?.activityDefaultCollapsed ?? true,
    };
  },
});

// Keep these subscriptions separate so a write to one table does not cause
// the client to reread workout data from the other tables.
export const getMySplits = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return null;
    const rows = await ctx.db.query('workoutSplits')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .collect();
    return {
      userId: ownerId,
      sessions: rows.sort((a, b) => a.position - b.position).map((row) => row.data),
    };
  },
});

export const getMyHistory = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return null;
    const rows = await ctx.db.query('workoutHistory')
      .withIndex('by_owner_and_started_at', (q) => q.eq('ownerId', ownerId))
      .collect();
    return {
      userId: ownerId,
      history: rows.sort((a, b) => a.startedAt - b.startedAt).map((row) => row.data),
    };
  },
});

export const getMyHistoryPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return { page: [], isDone: true, continueCursor: '' };
    const result = await ctx.db.query('workoutHistory')
      .withIndex('by_owner_and_started_at', (q) => q.eq('ownerId', ownerId))
      .order('desc')
      .paginate(paginationOpts);
    return { ...result, page: result.page.map((row) => row.data) };
  },
});

export const getMySettings = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return null;
    const [settings, user] = await Promise.all([
      ctx.db.query('workoutSettings').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).first(),
      ctx.db.get(ownerId),
    ]);
    return {
      userId: ownerId,
      user: user ? { name: user.name ?? null, email: user.email ?? null } : null,
      initialized: Boolean(settings),
      weeklyPlan: settings?.weeklyPlan ?? {},
      focusDraft: settings?.focusDraft ?? null,
      selectedSessionId: settings?.selectedSessionId ?? null,
      country: settings?.country ?? 'India',
      timeZone: settings?.timeZone ?? 'Asia/Kolkata',
      theme: settings?.theme ?? 'light',
      activityDefaultCollapsed: settings?.activityDefaultCollapsed ?? true,
      // Read these only for the one-time move from the old settings document.
      legacyActiveWorkout: settings?.activeWorkout ?? null,
      legacyWorking: settings?.working ?? null,
      legacyRestEndsAt: settings?.restEndsAt ?? null,
    };
  },
});

export const getMyActiveWorkout = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return null;
    const active = await ctx.db.query('activeWorkoutSessions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (!active) return { userId: ownerId, sessionKey: null, activeWorkout: null, working: null, restEndsAt: null };
    const setRows = await ctx.db.query('activeWorkoutSets')
      .withIndex('by_owner_session', (q) => q.eq('ownerId', ownerId).eq('sessionKey', active.sessionKey))
      .collect();
    const setsByMove = new Map<number, typeof setRows>();
    for (const row of setRows) setsByMove.set(row.moveIndex, [...(setsByMove.get(row.moveIndex) ?? []), row]);
    const working = {
      ...active.working,
      moves: active.working.moves.map((move: any, moveIndex: number) => ({
        ...move,
        sets: (setsByMove.get(moveIndex) ?? [])
          .sort((a, b) => a.setIndex - b.setIndex)
          .map(({ weight, reps, done }) => ({ weight, reps, done })),
      })),
    };
    return {
      userId: ownerId,
      sessionKey: active.sessionKey,
      activeWorkout: active?.activeWorkout ?? null,
      working,
      restEndsAt: active?.restEndsAt ?? null,
    };
  },
});

export const saveActiveWorkout = mutation({
  args: {
    activeWorkout: v.any(),
    working: v.any(),
    restEndsAt: v.union(v.number(), v.null()),
  },
  handler: async (ctx, data) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save your active workout.');
    const current = await ctx.db.query('activeWorkoutSessions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (!data.activeWorkout || !data.working) {
      if (current) {
        const sets = await ctx.db.query('activeWorkoutSets')
          .withIndex('by_owner_session', (q) => q.eq('ownerId', ownerId).eq('sessionKey', current.sessionKey))
          .collect();
        for (const set of sets) await ctx.db.delete(set._id);
        await ctx.db.delete(current._id);
      }
      return;
    }
    const sessionKey = String(data.activeWorkout.startedAt ?? Date.now());
    const template = {
      ...data.working,
      moves: data.working.moves.map((move: any) => ({ ...move, sets: [] })),
    };
    if (current && current.sessionKey !== sessionKey) {
      const oldSets = await ctx.db.query('activeWorkoutSets')
        .withIndex('by_owner_session', (q) => q.eq('ownerId', ownerId).eq('sessionKey', current.sessionKey))
        .collect();
      for (const set of oldSets) await ctx.db.delete(set._id);
      await ctx.db.delete(current._id);
    }
    const existing = current?.sessionKey === sessionKey ? current : null;
    const next = { ownerId, sessionKey, activeWorkout: data.activeWorkout, working: template, restEndsAt: data.restEndsAt, updatedAt: Date.now() };
    if (existing) {
      if (JSON.stringify(existing.activeWorkout) !== JSON.stringify(next.activeWorkout)
        || JSON.stringify(existing.working) !== JSON.stringify(next.working)
        || existing.restEndsAt !== next.restEndsAt) {
        await ctx.db.patch(existing._id, next);
      }
    }
    else {
      await ctx.db.insert('activeWorkoutSessions', next);
      for (const [moveIndex, move] of data.working.moves.entries()) {
        for (const [setIndex, set] of move.sets.entries()) {
          await ctx.db.insert('activeWorkoutSets', { ownerId, sessionKey, moveIndex, setIndex, weight: String(set.weight ?? '0'), reps: String(set.reps ?? '10'), done: Boolean(set.done) });
        }
      }
    }
  },
});

export const updateActiveWorkoutSet = mutation({
  args: {
    sessionKey: v.string(),
    moveIndex: v.number(),
    setIndex: v.number(),
    field: v.union(v.literal('weight'), v.literal('reps'), v.literal('done')),
    value: v.union(v.string(), v.boolean()),
  },
  handler: async (ctx, { sessionKey, moveIndex, setIndex, field, value }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to update your active workout.');
    const row = await ctx.db.query('activeWorkoutSets')
      .withIndex('by_owner_session_move_set', (q) => q.eq('ownerId', ownerId).eq('sessionKey', sessionKey).eq('moveIndex', moveIndex).eq('setIndex', setIndex))
      .first();
    if (!row) throw new Error('This workout set is no longer active.');
    if (field === 'done') {
      if (row.done !== Boolean(value)) await ctx.db.patch(row._id, { done: Boolean(value) });
    } else if (row[field] !== String(value)) {
      await ctx.db.patch(row._id, { [field]: String(value) });
    }
  },
});

export const addActiveWorkoutSet = mutation({
  args: {
    sessionKey: v.string(),
    moveIndex: v.number(),
    setIndex: v.number(),
    weight: v.string(),
    reps: v.string(),
  },
  handler: async (ctx, { sessionKey, moveIndex, setIndex, weight, reps }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to add a set.');
    const active = await ctx.db.query('activeWorkoutSessions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (!active || active.sessionKey !== sessionKey) throw new Error('This workout is no longer active.');
    await ctx.db.insert('activeWorkoutSets', { ownerId, sessionKey, moveIndex, setIndex, weight, reps, done: false });
  },
});

export const migrateLegacyActiveWorkout = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to migrate your active workout.');
    const settings = await ctx.db.query('workoutSettings')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (!settings || (!settings.activeWorkout && !settings.working && settings.restEndsAt == null)) return;

    const current = await ctx.db.query('activeWorkoutSessions')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (!current && settings.activeWorkout && settings.working) {
      const sessionKey = String(settings.activeWorkout.startedAt ?? Date.now());
      const template = {
        ...settings.working,
        moves: settings.working.moves.map((move: any) => ({ ...move, sets: [] })),
      };
      await ctx.db.insert('activeWorkoutSessions', {
        ownerId,
        sessionKey,
        activeWorkout: settings.activeWorkout,
        working: template,
        restEndsAt: settings.restEndsAt ?? null,
        updatedAt: Date.now(),
      });
      for (const [moveIndex, move] of settings.working.moves.entries()) {
        for (const [setIndex, set] of move.sets.entries()) {
          await ctx.db.insert('activeWorkoutSets', { ownerId, sessionKey, moveIndex, setIndex, weight: String(set.weight ?? '0'), reps: String(set.reps ?? '10'), done: Boolean(set.done) });
        }
      }
    }
    await ctx.db.patch(settings._id, {
      activeWorkout: undefined,
      working: undefined,
      restEndsAt: undefined,
      updatedAt: Date.now(),
    });
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
      if (existing) {
        if (existing.position !== position || JSON.stringify(existing.data) !== JSON.stringify(item)) {
          await ctx.db.patch(existing._id, { data: item, position, updatedAt: Date.now() });
        }
      }
      else await ctx.db.insert('workoutSplits', { ownerId, clientId, data: item, position, updatedAt: Date.now() });
    }
  },
});

export const upsertSplit = mutation({
  args: { item: v.any(), position: v.number() },
  handler: async (ctx, { item, position }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save your workout split.');
    const clientId = String(item.id);
    const existing = await ctx.db.query('workoutSplits')
      .withIndex('by_owner_and_client', (q) => q.eq('ownerId', ownerId).eq('clientId', clientId))
      .first();
    if (existing) {
      if (existing.position !== position || JSON.stringify(existing.data) !== JSON.stringify(item)) {
        await ctx.db.patch(existing._id, { data: item, position, updatedAt: Date.now() });
      }
    } else {
      await ctx.db.insert('workoutSplits', { ownerId, clientId, data: item, position, updatedAt: Date.now() });
    }
  },
});

export const deleteSplit = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to delete your workout split.');
    const existing = await ctx.db.query('workoutSplits')
      .withIndex('by_owner_and_client', (q) => q.eq('ownerId', ownerId).eq('clientId', clientId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
  },
});

export const reorderSplitPositions = mutation({
  args: { clientIds: v.array(v.string()) },
  handler: async (ctx, { clientIds }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to reorder your workout splits.');
    for (const [position, clientId] of clientIds.entries()) {
      const row = await ctx.db.query('workoutSplits')
        .withIndex('by_owner_and_client', (q) => q.eq('ownerId', ownerId).eq('clientId', clientId))
        .first();
      if (row && row.position !== position) await ctx.db.patch(row._id, { position, updatedAt: Date.now() });
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
      if (existing) {
        const startedAt = Number(item.startedAt) || 0;
        if (existing.startedAt !== startedAt || JSON.stringify(existing.data) !== JSON.stringify(item)) {
          await ctx.db.patch(existing._id, { data: item, startedAt });
        }
      }
      else await ctx.db.insert('workoutHistory', { ownerId, clientId, data: item, startedAt: Number(item.startedAt) || 0 });
    }
  },
});

export const upsertHistoryItem = mutation({
  args: { item: v.any() },
  handler: async (ctx, { item }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save workout history.');
    const clientId = String(item.id);
    const startedAt = Number(item.startedAt) || 0;
    const existing = await ctx.db.query('workoutHistory')
      .withIndex('by_owner_and_client', (q) => q.eq('ownerId', ownerId).eq('clientId', clientId))
      .first();
    if (existing) {
      if (existing.startedAt !== startedAt || JSON.stringify(existing.data) !== JSON.stringify(item)) {
        await ctx.db.patch(existing._id, { data: item, startedAt });
      }
    } else {
      await ctx.db.insert('workoutHistory', { ownerId, clientId, data: item, startedAt });
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
    focusDraft: v.any(),
    selectedSessionId: v.union(v.string(), v.null()),
    country: v.string(),
    timeZone: v.string(),
    theme: v.union(v.literal('light'), v.literal('dark'), v.literal('cyberpunk')),
    activityDefaultCollapsed: v.boolean(),
  },
  handler: async (ctx, data) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save your workout plan.');
    const current = await ctx.db.query('workoutSettings').withIndex('by_owner', (q) => q.eq('ownerId', ownerId)).first();
    if (current) {
      const unchanged = Object.entries(data).every(([key, value]) => JSON.stringify((current as any)[key]) === JSON.stringify(value));
      if (!unchanged) await ctx.db.patch(current._id, { ...data, updatedAt: Date.now() });
    }
    else await ctx.db.insert('workoutSettings', { ownerId, ...data, updatedAt: Date.now() });
  },
});
