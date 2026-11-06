import assert from 'node:assert/strict';
import test from 'node:test';
import { DataValidationError, loadData, validateData } from '../src/data/load-data.js';
import { getEligibleCircles } from '../src/recommendation/eligibility.js';
import { getNormalizedSignals, scoreCircle } from '../src/recommendation/scoring.js';
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

test('startup validation rejects structural, relational, enum, and timestamp errors', () => {
  const mutations = [
    (rawData) => { rawData.circles[0].member_count += 1; },
    (rawData) => { rawData.memberships[0].user_id = 9999; },
    (rawData) => { rawData.circles[0].format = 'telepathic'; },
    (rawData) => { rawData.users[0].joined_at = '2026'; },
    (rawData) => { rawData.topics[0] = null; },
  ];
  for (const mutate of mutations) {
    const rawData = rawDataCopy();
    mutate(rawData);
    assert.throws(() => validateData(rawData), DataValidationError);
  }
});

test('startup loading normalizes duplicate tags without changing the seed files', () => {
  const circle17 = data.circles.find((circle) => circle.id === 17);
  assert.equal(circle17.tags.length, new Set(circle17.tags).size);
});

test('duplicate detection finds only the planted negotiation cluster', () => {
  const clusters = [...service.getDuplicateClusters().membersByCluster.values()]
    .filter((members) => members.length > 1);
  assert.deepEqual(clusters, [[10, 11, 12]]);
});

test('all normalized signals and scores stay within bounds', () => {
  for (const user of data.users) {
    const mode = user.topic_interests.length === 0 ? 'cold_start' : 'personalized';
    for (const circle of getEligibleCircles(user.id, data)) {
      const normalized = getNormalizedSignals(circle, mode === 'cold_start' ? null : user, data);
      for (const value of Object.values(normalized)) assert.ok(value >= 0 && value <= 1);
      const result = scoreCircle(circle, user, data, mode);
      assert.ok(result.score >= 0 && result.score <= 100);
    }
  }
});

test('user 7 receives strong leadership and public-speaking recommendations', () => {
  const result = service.recommend(7, 5);
  assert.equal(result.mode, 'personalized');
  const ids = result.recommendations.map(({ circle }) => circle.id);
  assert.deepEqual(ids.slice(0, 3), [1, 6, 5]);
  assert.ok(ids.includes(5));
  assert.ok(ids.includes(6));
  const circle6 = result.recommendations.find(({ circle }) => circle.id === 6);
  assert.deepEqual(circle6.matches, [
    { topic: 'public-speaking', source: 'primary' },
    { topic: 'leadership-skills', source: 'tag' },
  ]);
});

test('user 15 receives confidence and negotiation without duplicate domination', () => {
  const result = service.recommend(15, 10);
  const ids = result.recommendations.map(({ circle }) => circle.id);
  assert.ok(ids.includes(10));
  assert.ok(ids.includes(13));
  assert.ok(ids.includes(37));
  assert.equal(ids.filter((id) => [10, 11, 12].includes(id)).length, 1);
});

test('user 23 excludes the full and inactive Circles and ranks Circle 22 first', () => {
  const result = service.recommend(23, 10);
  const ids = result.recommendations.map(({ circle }) => circle.id);
  assert.equal(ids[0], 22);
  assert.ok(!ids.includes(20));
  assert.ok(!ids.includes(21));
  assert.match(result.recommendations[0].explanation, /joining requires approval/);
});

test('user 42 receives a diverse cold-start list without fabricated matches', () => {
  const result = service.recommend(42, 10);
  assert.equal(result.mode, 'cold_start');
  assert.equal(result.recommendations.length, 10);
  assert.equal(new Set(result.recommendations.map(({ circle }) => circle.topic)).size, 10);
  for (const recommendation of result.recommendations) {
    assert.deepEqual(recommendation.matches, []);
    assert.doesNotMatch(recommendation.explanation, /your interest/i);
    assert.equal(recommendation.circle.access, 'public');
  }
});
