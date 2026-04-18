const { LEGACY_DEMO_FORUM_TITLES } = require("./forumLegacyDemoTitles");

/**
 * MongoDB filter for posts returned on the user Forum feed (`GET /forum/posts`).
 * Excludes removed moderation state and legacy demo/seed titles (same as previous in-memory filter).
 */
function forumPostsUserVisibleFilter() {
  return {
    status: { $ne: "removed" },
    title: { $nin: [...LEGACY_DEMO_FORUM_TITLES] },
  };
}

/**
 * Primary admin moderation list: same title universe as the live forum (no legacy seed/mock rows),
 * but includes `removed` / `warned` / `normal` for moderation actions.
 */
function forumPostsModerationListFilter() {
  return {
    title: { $nin: [...LEGACY_DEMO_FORUM_TITLES] },
  };
}

module.exports = {
  forumPostsUserVisibleFilter,
  forumPostsModerationListFilter,
  LEGACY_DEMO_FORUM_TITLES,
};
