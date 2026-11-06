import assert from 'node:assert/strict';
import test from 'node:test';
import { SNAPSHOT_AT } from '../src/config.js';
import { loadData, validateData } from '../src/data/load-data.js';
import { diversifyColdStart, diversifyPersonalized } from '../src/recommendation/diversification.js';
import { getIneligibilityReasons, isInactive } from '../src/recommendation/eligibility.js';
import { hasRecentActivity } from '../src/recommendation/explanations.js';
import { compareRankedCandidates } from '../src/recommendation/scoring.js';
import { createRecommendationService } from '../src/recommendation/recommendation-service.js';

const data = loadData();
const service = createRecommendationService(data);

function rawDataCopy() {
  return structuredClone({
    topics: data.topics,
    users: data.users,
    circles: data.circles,
    memberships: data.memberships,
    activity: data.activity,
  });
}

test('a Circle exactly at capacity is ineligible', () => {
  const circle20 = data.circles.find((circle) => circle.id === 20);
  assert.equal(circle20.member_count, circle20.max_members);
  assert.ok(getIneligibilityReasons(circle20, 23, data).includes('full'));

  const withOneSpace = { ...circle20, max_members: circle20.max_members + 1 };
  assert.ok(!getIneligibilityReasons(withOneSpace, 23, data).includes('full'));
});

test('the inactivity date and chat boundaries are inclusive in favor of eligibility', () => {
  const base = {
    ...data.circles.find((circle) => circle.id === 21),
    feed_posts_30d: 0,
  };
  assert.equal(isInactive({ ...base, last_activity_at: '2026-06-23T00:00:00.000Z', chat_messages_30d: 0 }), false);
  assert.equal(isInactive({ ...base, last_activity_at: '2026-06-22T23:59:59.999Z', chat_messages_30d: 5 }), false);
  assert.equal(isInactive({ ...base, last_activity_at: '2026-06-22T23:59:59.999Z', chat_messages_30d: 4 }), true);
});

test('the service can return an empty recommendation list', () => {
  const raw = rawDataCopy();
  raw.circles = raw.circles.map((circle) => ({ ...circle, access: 'unlisted' }));
  const emptyService = createRecommendationService(validateData(raw));
  const result = emptyService.recommend(42, 10);
  assert.equal(result.mode, 'cold_start');
  assert.deepEqual(result.recommendations, []);
});

test('tie-breaking is deterministic and follows activity, membership, then id', () => {
  const candidate = (id, lastActivityAt, memberCount) => ({
    score: 50,
    circle: { id, last_activity_at: lastActivityAt, member_count: memberCount },
  });

  const ranked = [
    candidate(4, '2026-09-19T00:00:00.000Z', 20),
    candidate(3, '2026-09-20T00:00:00.000Z', 10),
    candidate(2, '2026-09-20T00:00:00.000Z', 12),
    candidate(1, '2026-09-20T00:00:00.000Z', 12),
  ].sort(compareRankedCandidates);

  assert.deepEqual(ranked.map(({ circle }) => circle.id), [1, 2, 3, 4]);
  assert.deepEqual(service.recommend(7, 10), service.recommend(7, 10));
});

test('duplicate backfill admits at most a second cluster member', () => {
  const ranked = [1, 2, 3, 4].map((id) => ({
    score: 100 - id,
    circle: { id, topic: id === 4 ? 'topic-b' : 'topic-a' },
  }));
  const clusters = new Map([[1, 100], [2, 100], [3, 100], [4, 4]]);

  const cold = diversifyColdStart(ranked, 4, clusters);
  assert.deepEqual(cold.map(({ circle }) => circle.id), [1, 4, 2]);

  const regular = diversifyPersonalized(ranked, { topic_interests: ['topic-a'] }, 4, clusters);
  assert.deepEqual(regular.map(({ circle }) => circle.id), [1, 4, 2]);
});

test('all returned explanations are supported by the corresponding records', () => {
  for (const user of data.users) {
    const result = service.recommend(user.id, 10);
    for (const recommendation of result.recommendations) {
      const circle = data.circles.find((candidate) => candidate.id === recommendation.circle.id);
      assert.equal(circle.access, 'public');
      assert.ok(circle.max_members === null || circle.member_count < circle.max_members);
      assert.ok(recommendation.reason_codes.includes('SPACE_AVAILABLE'));
      if (recommendation.explanation.includes('space available')) {
        assert.ok(circle.max_members === null || circle.member_count < circle.max_members);
      }

      const recent = hasRecentActivity(circle);
      assert.equal(recommendation.reason_codes.includes('RECENT_ACTIVITY'), recent);
      const explanationClaimsActivity = recommendation.explanation.includes('recent activity')
        || recommendation.explanation.startsWith('An active public Circle');
      assert.equal(explanationClaimsActivity, recent);
      assert.equal(recommendation.explanation.includes('joining requires approval'), circle.join_policy === 'request');

      for (const match of recommendation.matches) {
        assert.ok(user.topic_interests.includes(match.topic));
        if (match.source === 'primary') assert.equal(circle.topic, match.topic);
        else {
          assert.equal(match.source, 'tag');
          assert.ok(circle.tags.includes(match.topic));
          assert.notEqual(circle.topic, match.topic);
        }
      }
      if (/your interests?/i.test(recommendation.explanation)) {
        assert.ok(recommendation.matches.some((match) => match.source === 'primary'));
      }
    }
  }
});

test('responses contain neither sensitive profile fields nor internal scoring data', () => {
  const disallowedKeys = [
    'score', 'normalized', 'components', 'first_name', 'last_name', 'has_photo',
    'bio', 'job_title', 'company', 'industry', 'location', 'profile_completeness',
  ];
  for (const userId of [7, 15, 23, 42]) {
    const payload = JSON.stringify(service.recommend(userId, 10));
    for (const key of disallowedKeys) assert.doesNotMatch(payload, new RegExp(`"${key}"\\s*:`));
  }
});

test('snapshot-dependent behavior uses the fixed dataset clock', () => {
  assert.equal(SNAPSHOT_AT, '2026-09-21T00:00:00.000Z');
});
