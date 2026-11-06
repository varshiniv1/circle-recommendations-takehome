import {
  COLD_START_WEIGHTS,
  ENGAGEMENT_WINDOW_DAYS,
  PERSONALIZED_WEIGHTS,
  SNAPSHOT_AT,
} from '../config.js';

const DAY_IN_MS = 86_400_000;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

export function getNormalizedSignals(circle, user, data) {
  const interests = new Set(user?.topic_interests ?? []);
  const secondaryTags = circle.tags.filter((tag) => tag !== circle.topic);
  const tagMatches = secondaryTags.filter((tag) => interests.has(tag)).length;
  const windowStart = Date.parse(SNAPSHOT_AT) - ENGAGEMENT_WINDOW_DAYS * DAY_IN_MS;
  const snapshot = Date.parse(SNAPSHOT_AT);
  const recentPosts = (data.indexes.activityByCircle.get(circle.id) ?? [])
    .filter((post) => {
      const createdAt = Date.parse(post.created_at);
      return createdAt >= windowStart && createdAt <= snapshot;
    });
  const averageEngagement = recentPosts.length === 0
    ? 0
    : recentPosts.reduce(
      (sum, post) => sum + post.reaction_count + post.comment_count + post.save_count,
      0,
    ) / recentPosts.length;

  return {
    primary: interests.has(circle.topic) ? 1 : 0,
    tag: Math.min(tagMatches / 2, 1),
    feed: clamp01(circle.feed_posts_30d / 12),
    chat: clamp01(Math.log1p(circle.chat_messages_30d) / Math.log1p(150)),
    engagement: clamp01(Math.log1p(averageEngagement) / Math.log1p(25)),
    availability: circle.max_members === null
      ? 1
      : clamp01((circle.max_members - circle.member_count) / circle.max_members),
    popularity: clamp01(Math.log1p(circle.member_count) / Math.log1p(25)),
    join: circle.join_policy === 'open' ? 1 : 0,
  };
}

export function scoreCircle(circle, user, data, mode) {
  const weights = mode === 'cold_start' ? COLD_START_WEIGHTS : PERSONALIZED_WEIGHTS;
  const normalized = getNormalizedSignals(circle, mode === 'cold_start' ? null : user, data);
  const components = Object.fromEntries(
    Object.entries(weights).map(([name, weight]) => [name, normalized[name] * weight]),
  );
  const score = Object.values(components).reduce((sum, value) => sum + value, 0);
  return { circle, normalized, components, score };
}

export function compareRankedCandidates(left, right) {
  return right.score - left.score
    || Date.parse(right.circle.last_activity_at) - Date.parse(left.circle.last_activity_at)
    || right.circle.member_count - left.circle.member_count
    || left.circle.id - right.circle.id;
}
