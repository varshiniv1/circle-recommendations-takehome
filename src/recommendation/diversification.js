const topicKey = (circle) => circle.topic ?? '__untagged__';

function partitionClusterCandidates(ranked, clusterByCircleId) {
  const seenClusters = new Set();
  const winners = [];
  const suppressed = [];
  for (const candidate of ranked) {
    const clusterId = clusterByCircleId.get(candidate.circle.id);
    if (seenClusters.has(clusterId)) suppressed.push(candidate);
    else {
      seenClusters.add(clusterId);
      winners.push(candidate);
    }
  }
  return { winners, suppressed };
}

function createSelection(limit, clusterByCircleId) {
  const results = [];
  const selectedIds = new Set();
  const topicCounts = new Map();
  const clusterCounts = new Map();
  const add = (candidate) => {
    if (results.length >= limit || selectedIds.has(candidate.circle.id)) return false;
    results.push(candidate);
    selectedIds.add(candidate.circle.id);
    const topic = topicKey(candidate.circle);
    const cluster = clusterByCircleId.get(candidate.circle.id);
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    clusterCounts.set(cluster, (clusterCounts.get(cluster) ?? 0) + 1);
    return true;
  };
  return { results, selectedIds, topicCounts, clusterCounts, add };
}

function backfillDuplicateClusters(selection, suppressed, clusterByCircleId, limit) {
  for (const candidate of suppressed) {
    if (selection.results.length >= limit) break;
    const clusterId = clusterByCircleId.get(candidate.circle.id);
    if ((selection.clusterCounts.get(clusterId) ?? 0) < 2) selection.add(candidate);
  }
}

export function diversifyPersonalized(ranked, user, limit, clusterByCircleId) {
  const { winners, suppressed } = partitionClusterCandidates(ranked, clusterByCircleId);
  const selection = createSelection(limit, clusterByCircleId);
  const interests = new Set(user.topic_interests);
  const coveredInterests = new Set();

  for (const candidate of winners) {
    if (selection.results.length >= limit) break;
    const topic = candidate.circle.topic;
    if (interests.has(topic) && !coveredInterests.has(topic)) {
      selection.add(candidate);
      coveredInterests.add(topic);
    }
  }

  for (const candidate of winners) {
    if (selection.results.length >= limit) break;
    if (selection.selectedIds.has(candidate.circle.id)) continue;
    if ((selection.topicCounts.get(topicKey(candidate.circle)) ?? 0) < 2) selection.add(candidate);
  }

  for (const candidate of winners) {
    if (selection.results.length >= limit) break;
    selection.add(candidate);
  }

  backfillDuplicateClusters(selection, suppressed, clusterByCircleId, limit);
  return selection.results;
}

export function diversifyColdStart(ranked, limit, clusterByCircleId) {
  const { winners, suppressed } = partitionClusterCandidates(ranked, clusterByCircleId);
  const selection = createSelection(limit, clusterByCircleId);

  for (const candidate of winners) {
    if (selection.results.length >= limit) break;
    if (!selection.topicCounts.has(topicKey(candidate.circle))) selection.add(candidate);
  }

  for (const candidate of winners) {
    if (selection.results.length >= limit) break;
    if (selection.selectedIds.has(candidate.circle.id)) continue;
    if ((selection.topicCounts.get(topicKey(candidate.circle)) ?? 0) < 2) selection.add(candidate);
  }

  backfillDuplicateClusters(selection, suppressed, clusterByCircleId, limit);
  return selection.results;
}
