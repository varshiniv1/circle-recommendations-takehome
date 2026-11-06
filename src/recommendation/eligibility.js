import { INACTIVITY_DAYS, SNAPSHOT_AT } from '../config.js';

const DAY_IN_MS = 86_400_000;

export function isInactive(circle, snapshotAt = SNAPSHOT_AT) {
  const cutoff = Date.parse(snapshotAt) - INACTIVITY_DAYS * DAY_IN_MS;
  return Date.parse(circle.last_activity_at) < cutoff
    && circle.feed_posts_30d === 0
    && circle.chat_messages_30d < 5;
}

export function getIneligibilityReasons(circle, userId, data) {
  const reasons = [];
  if (data.indexes.membershipKeys.has(`${userId}:${circle.id}`)) reasons.push('already_joined');
  if (circle.max_members !== null && circle.member_count >= circle.max_members) reasons.push('full');
  if (circle.access === 'unlisted') reasons.push('unlisted');
  if (isInactive(circle)) reasons.push('inactive');
  return reasons;
}

export function getEligibleCircles(userId, data) {
  return data.circles.filter((circle) => getIneligibilityReasons(circle, userId, data).length === 0);
}
