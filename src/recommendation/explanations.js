import { ENGAGEMENT_WINDOW_DAYS, SNAPSHOT_AT } from '../config.js';

const DAY_IN_MS = 86_400_000;

function formatLabels(slugs, topicsBySlug) {
  return slugs.map((slug) => topicsBySlug.get(slug)?.label ?? slug).join(' and ');
}

export function hasRecentActivity(circle) {
  const recentCutoff = Date.parse(SNAPSHOT_AT) - ENGAGEMENT_WINDOW_DAYS * DAY_IN_MS;
  return Date.parse(circle.last_activity_at) >= recentCutoff
    || circle.feed_posts_30d > 0
    || circle.chat_messages_30d >= 5;
}

export function buildExplanation(circle, user, data) {
  const interests = new Set(user?.topic_interests ?? []);
  const exactMatch = interests.has(circle.topic);
  const secondaryMatches = circle.tags
    .filter((tag) => tag !== circle.topic && interests.has(tag));
  const matchedSlugs = exactMatch
    ? [circle.topic, ...secondaryMatches].slice(0, 2)
    : secondaryMatches.slice(0, 2);
  const matches = matchedSlugs.map((topic, index) => ({
    topic,
    source: exactMatch && index === 0 ? 'primary' : 'tag',
  }));
  const recent = hasRecentActivity(circle);
  const reasonCodes = [];
  if (exactMatch) reasonCodes.push('PRIMARY_TOPIC_MATCH');
  if (secondaryMatches.length > 0) reasonCodes.push('TAG_TOPIC_MATCH');
  if (recent) reasonCodes.push('RECENT_ACTIVITY');
  reasonCodes.push('SPACE_AVAILABLE');
  if (circle.join_policy === 'request') reasonCodes.push('REQUIRES_APPROVAL');

  let relevance = null;
  if (exactMatch) {
    relevance = `Matches your ${matchedSlugs.length > 1 ? 'interests' : 'interest'} in ${formatLabels(matchedSlugs, data.indexes.topicsBySlug)}`;
  } else if (matchedSlugs.length > 0) {
    relevance = `Includes ${formatLabels(matchedSlugs, data.indexes.topicsBySlug)} among its topics`;
  }

  let explanation;
  if (relevance && circle.join_policy === 'request') {
    explanation = recent
      ? `${relevance}; this Circle has recent activity, and joining requires approval.`
      : `${relevance}; joining requires approval.`;
  } else if (relevance) {
    explanation = recent
      ? `${relevance}; this Circle has recent activity and space available.`
      : `${relevance}; this Circle has space available.`;
  } else if (circle.join_policy === 'request') {
    explanation = `${recent ? 'An active' : 'A'} public Circle with space available; joining requires approval.`;
  } else {
    explanation = `${recent ? 'An active' : 'A'} public Circle with space available.`;
  }

  return { explanation, matches, reasonCodes };
}
