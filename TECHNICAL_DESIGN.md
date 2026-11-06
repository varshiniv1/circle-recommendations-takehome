# Technical Design

## Problem and product goal

The service recommends Circles a member can realistically discover and join. It balances stated topic relevance with Circle health and availability, avoids redundant groups, and supports members with no interests or history. It is designed for explainable discovery and does not claim to cause promotions or other career outcomes.

## Implemented today

### Request and recommendation flow

1. The Node HTTP handler validates the route, user ID, and optional limit.
2. Startup loading validates the five JSON datasets and builds indexes for users, topics, memberships, and Circle activity.
3. The service filters, scores, and deterministically sorts candidates by score, activity time, member count, then ID.
4. Duplicate suppression and topic diversification produce the final list.
5. The API returns Circle data, record-backed matches, reason codes, and an explanation, but never internal scores.

Invalid requests use Problem Details JSON with a request ID. Invalid seed data prevents startup.

### Eligibility and ranking decisions

Eligibility is a hard gate. A Circle is removed when the member already belongs, it is at or above a non-null capacity, it is unlisted, or it is inactive. Against the fixed `2026-09-21` snapshot, inactivity requires activity older than 90 days, zero recent feed posts, and fewer than five recent chat messages. Requiring all three avoids discarding chat-active Circles.

For members with interests, primary-topic relevance receives 50 points and tag overlap 10. Feed activity (8), chat activity (7), engagement (8), capacity (6), bounded popularity (6), and open joining (5) supply the remaining 40. Capped or logarithmic normalization prevents volume from overwhelming relevance. Request-to-join Circles remain eligible.

Cold-start members receive no inferred relevance. Their score uses feed, chat, and engagement (20 each), capacity and popularity (15 each), and join policy (10), producing quality-based discovery without guessing from profile or demographic fields.

Duplicate detection is independent of IDs: Circles must share a primary topic and have description Jaccard similarity of at least 0.85, plus name similarity of 0.50 or tag similarity of 0.67. Connected matches form a cluster. Personalized lists cover distinct exact interests and initially allow two results per topic; cold-start lists begin with one per topic, then two. A second cluster member appears only during exhausted backfill, with a maximum of two per cluster.

### Data model and indexes

Runtime storage is validated in-memory JSON for portability. `schema.sql` captures the normalized SQLite model: interests and tags become join tables, memberships use `(user_id, circle_id)`, and activity authors reference membership in the same Circle. Foreign keys and checks document intended persistence rules.

Indexes cover topic-to-user interests, Circle topic/access, Circle membership, and `(circle_id, created_at DESC)` activity. Runtime maps mirror the dataset's main read paths.

### Member-facing explanations

Explanations use only topic matches, recent activity, available space, and approval requirements. Cold-start text does not claim a known preference. Sensitive profile fields and internal scores are excluded from ranking and explanations.

### Time-box tradeoffs

For the 3-4 hour limit, deterministic rules were preferred over embeddings, collaborative filtering, an ORM, or a deployed database. Fixed weights are inspectable hypotheses, not learned values. In-memory scoring fits 100 users and 40 Circles; authentication, persistence, and administration are out of scope.

### Testing and validation

Twenty-six built-in tests cover startup and schema validation, score bounds, planted scenarios, boundary conditions, duplicate backfill, cold-start diversity, deterministic ties, empty results, HTTP errors, and Problem Details. They also verify explanations against source records and prevent exposure of sensitive fields or scoring internals.

## Future production improvements

- **PostgreSQL:** use indexed joins and precomputed Circle-health features in the normalized model.
- **Caching:** cache ranked candidates by user/data version, invalidate on membership or Circle changes, and recheck eligibility at read time.
- **Scale and reliability:** separate feature computation from serving, process updates asynchronously, and add health checks and stale-data policies.
- **Observability:** measure latency, errors, filter reasons, candidate counts, cold-start rate, score distributions, and cache behavior without logging private content.
- **Feedback:** capture impressions, joins, hides, leaves, and sustained participation while separating exposure from engagement.
- **Experimentation:** version policies and run guarded A/B tests on discovery quality, coverage, acceptance, and member-reported usefulness, not causal career outcomes.
- **Privacy:** minimize features, enforce access and retention controls, keep chat aggregated, and review new text/profile signals.
- **Fairness monitoring:** audit privacy-preserving cohort exposure and engagement, especially for popularity/activity effects, and introduce constraints when disparities are not explained by eligibility or member choice.
