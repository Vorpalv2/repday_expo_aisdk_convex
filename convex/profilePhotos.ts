import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';
import { mutation, query } from './_generated/server';

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to upload a profile photo.');
    return await ctx.storage.generateUploadUrl();
  },
});

export const save = mutation({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to save a profile photo.');

    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata || !metadata.contentType?.startsWith('image/')) {
      throw new Error('Upload a valid image file.');
    }
    if (metadata.size > MAX_PROFILE_PHOTO_BYTES) {
      await ctx.storage.delete(storageId);
      throw new Error('Profile photos must be 5 MB or smaller.');
    }

    const current = await ctx.db
      .query('profilePhotos')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (current) {
      if (current.storageId !== storageId) await ctx.storage.delete(current.storageId);
      await ctx.db.patch(current._id, { storageId, updatedAt: Date.now() });
    } else {
      await ctx.db.insert('profilePhotos', { ownerId, storageId, updatedAt: Date.now() });
    }
  },
});

export const getMyUrl = query({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) return null;
    const photo = await ctx.db
      .query('profilePhotos')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    return photo ? await ctx.storage.getUrl(photo.storageId) : null;
  },
});

export const remove = mutation({
  args: {},
  handler: async (ctx) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error('Sign in to remove your profile photo.');
    const photo = await ctx.db
      .query('profilePhotos')
      .withIndex('by_owner', (q) => q.eq('ownerId', ownerId))
      .first();
    if (photo) {
      await ctx.storage.delete(photo.storageId);
      await ctx.db.delete(photo._id);
    }
  },
});
