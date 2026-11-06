const NAME_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'of', 'for', 'to', 'like',
  'circle', 'collective', 'guild', 'group',
]);

function stemToken(token) {
  if (token.length > 7 && token.endsWith('ation')) return `${token.slice(0, -5)}ate`;
  if (token.length > 7 && token.endsWith('ating')) return `${token.slice(0, -5)}ate`;
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s')) return token.slice(0, -1);
  return token;
}

function tokenize(value, { name = false } = {}) {
  return (value ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !name || !NAME_STOP_WORDS.has(token))
    .map(stemToken);
}

function jaccard(leftValues, rightValues) {
  const left = new Set(leftValues);
  const right = new Set(rightValues);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  let intersectionSize = 0;
  for (const value of left) if (right.has(value)) intersectionSize += 1;
  return intersectionSize / union.size;
}

export function areDuplicateCandidates(left, right) {
  if (left.topic === null || left.topic !== right.topic) return false;
  const descriptionSimilarity = jaccard(tokenize(left.description), tokenize(right.description));
  if (descriptionSimilarity < 0.85) return false;
  const nameSimilarity = jaccard(tokenize(left.name, { name: true }), tokenize(right.name, { name: true }));
  const tagSimilarity = jaccard(left.tags, right.tags);
  return nameSimilarity >= 0.5 || tagSimilarity >= 0.67;
}

export function buildDuplicateClusters(circles) {
  const parent = new Map(circles.map((circle) => [circle.id, circle.id]));
  const find = (id) => {
    const current = parent.get(id);
    if (current !== id) parent.set(id, find(current));
    return parent.get(id);
  };
  const union = (leftId, rightId) => {
    const leftRoot = find(leftId);
    const rightRoot = find(rightId);
    if (leftRoot === rightRoot) return;
    parent.set(Math.max(leftRoot, rightRoot), Math.min(leftRoot, rightRoot));
  };

  for (let leftIndex = 0; leftIndex < circles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < circles.length; rightIndex += 1) {
      if (areDuplicateCandidates(circles[leftIndex], circles[rightIndex])) {
        union(circles[leftIndex].id, circles[rightIndex].id);
      }
    }
  }

  const clusterByCircleId = new Map();
  const membersByCluster = new Map();
  for (const circle of circles) {
    const clusterId = find(circle.id);
    clusterByCircleId.set(circle.id, clusterId);
    const members = membersByCluster.get(clusterId) ?? [];
    members.push(circle.id);
    membersByCluster.set(clusterId, members);
  }
  for (const members of membersByCluster.values()) members.sort((left, right) => left - right);
  return { clusterByCircleId, membersByCluster };
}
