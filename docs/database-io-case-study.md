# Database I/O: Finding and Fixing Excessive Reads

## The issue

During development, the Convex dashboard showed Database I/O above the included allowance: it was **1.58 GB / 1 GB** when the issue was first investigated. Database I/O measures bytes read from and written to the database, so a modest dataset can still generate high usage when broad queries or writes run repeatedly.

The main problem was how data moved through the app. The initial `getMyData` query collected every workout split and every history record along with settings, then returned them together. Local split and history changes also triggered full-list sync mutations that scanned the user's existing records to reconcile them. This made a small action capable of causing database work over much more data than that action needed.

## What changed

- Split, history, settings, and active-workout data now have separate query subscriptions. A change in one area no longer requires the combined `getMyData` query to reload all of them.
- Workout history loads 30 records initially through a paginated query, with an option to load older records when needed.
- Completing a workout or deleting a history item uses an indexed, single-record upsert or delete. Full history sync remains available for legacy data migration.
- Routine split edits and deletes use indexed, single-record mutations. Full split reconciliation is reserved for legacy migration and bulk import.
- Active workout set values are stored as individual rows. Updating a set uses the owner, session, move, and set index to locate that row, and avoids writing when the value is already current.
- Settings and active-workout mutations also skip unchanged writes.

## How to verify the impact

Usage totals are cumulative for the selected reporting window; deploying a fix does not reduce bytes already used. For a useful before-and-after comparison, select the Repday project, choose the **production** deployment, and narrow the date range to start at the deployment time. The team usage page can include other projects and development deployments, so confirm those filters before attributing a number to production traffic.

Compare Database I/O over similar periods and similar app activity. In the **Database I/O** breakdown by function, look for broad sync functions such as `workouts.syncHistory` and `workouts.syncSplits` to become uncommon outside migration or bulk import. For a set update, `workouts.updateActiveWorkoutSet` should do work for the targeted set; watch its I/O and the related `workouts.getMyActiveWorkout` subscription as well. Function-call totals and Database I/O are separate metrics: fewer calls do not automatically mean fewer bytes, and one call can still read or write a large amount.

One remaining tradeoff is that `getMySplits` still returns the user's full split list, and `getMyActiveWorkout` returns all sets for the active workout so the screen can render them. If those datasets grow substantially, consider splitting lightweight list summaries from detail views and measuring whether the active-workout subscription should be narrowed further.
