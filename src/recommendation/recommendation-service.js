import { buildDuplicateClusters } from './duplicate-detection.js';
import { diversifyColdStart, diversifyPersonalized } from './diversification.js';
import { getEligibleCircles } from './eligibility.js';
import { buildExplanation } from './explanations.js';
import { compareRankedCandidates, scoreCircle } from './scoring.js';

function circleResponse(circle) {
  return {
    id: circle.id,
    name: circle.name,
    slug: circle.slug,
    description: circle.description,
    topic: circle.topic,
    tags: circle.tags,
    cover_image_url: circle.cover_image_url,
    format: circle.format,
    access: circle.access,
    join_policy: circle.join_policy,
    member_count: circle.member_count,
    max_members: circle.max_members,
  };
}

export function createRecommendationService(data) {
  const duplicateClusters = buildDuplicateClusters(data.circles);

  return {
    getDuplicateClusters() {
      return duplicateClusters;
    },

    recommend(userId, limit) {
      const user = data.indexes.usersById.get(userId);
      if (!user) return null;
      const mode = user.topic_interests.length === 0 ? 'cold_start' : 'personalized';
      const ranked = getEligibleCircles(userId, data)
        .map((circle) => scoreCircle(circle, user, data, mode))
        .sort(compareRankedCandidates);
      const diversified = mode === 'cold_start'
        ? diversifyColdStart(ranked, limit, duplicateClusters.clusterByCircleId)
        : diversifyPersonalized(ranked, user, limit, duplicateClusters.clusterByCircleId);

      const recommendations = diversified.map((candidate, index) => {
        const reason = buildExplanation(
          candidate.circle,
          mode === 'cold_start' ? null : user,
          data,
        );
        return {
          rank: index + 1,
          circle: circleResponse(candidate.circle),
          matches: reason.matches,
          reason_codes: reason.reasonCodes,
          explanation: reason.explanation,
        };
      });

      return { userId, mode, recommendations };
    },
  };
}
