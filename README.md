# Circle Recommendations API

A deterministic recommendation API for suggesting Lean In-style peer Circles to members. The service loads and validates the supplied synthetic JSON dataset at startup, filters ineligible Circles, ranks candidates with explainable signals, and diversifies the final list to avoid redundant recommendations.

## Technology choices

- Modern JavaScript with ES modules
- Node.js built-in HTTP server
- Node.js built-in test runner and strict assertions
- In-memory JSON data for a dependency-free runtime
- A normalized SQLite design in `schema.sql` for the intended relational model

The project has no runtime or development package dependencies.

## Requirements

- Node.js 20 or newer
- npm

## Install, test, and run

```bash
npm install
npm test
npm start
```

The server listens on `http://localhost:3000` by default. Set the `PORT` environment variable before running `npm start` to use a different port.

## API

### Get Circle recommendations

```http
GET /v1/users/{userId}/circle-recommendations?limit=5
```

| Parameter | Location | Required | Rules |
| --- | --- | --- | --- |
| `userId` | Path | Yes | Positive safe integer for an existing user |
| `limit` | Query | No | Integer from 1 to 10; defaults to 5 |

Unknown query parameters, repeated `limit` parameters, and GET request bodies are rejected. The endpoint returns fewer than `limit` results when too few Circles are eligible.

#### Success response

Example for `GET /v1/users/23/circle-recommendations?limit=1`:

```json
{
  "data": {
    "user_id": 23,
    "mode": "personalized",
    "snapshot_at": "2026-09-21T00:00:00.000Z",
    "recommendations": [
      {
        "rank": 1,
        "circle": {
          "id": 22,
          "name": "Level Up Collective",
          "slug": "level-up-collective",
          "description": "A supportive circle for women focused on getting promoted.",
          "topic": "getting-promoted",
          "tags": ["getting-promoted"],
          "cover_image_url": "https://images.example.org/circles/level-up-collective.jpg",
          "format": "hybrid",
          "access": "public",
          "join_policy": "request",
          "member_count": 14,
          "max_members": 20
        },
        "matches": [
          {
            "topic": "getting-promoted",
            "source": "primary"
          }
        ],
        "reason_codes": [
          "PRIMARY_TOPIC_MATCH",
          "RECENT_ACTIVITY",
          "SPACE_AVAILABLE",
          "REQUIRES_APPROVAL"
        ],
        "explanation": "Matches your interest in Getting promoted; this Circle has recent activity, and joining requires approval."
      }
    ]
  },
  "meta": {
    "requested_limit": 1,
    "returned": 1
  }
}
```

Scores and internal scoring components are intentionally not exposed.

#### Error response

Errors use `application/problem+json`:

```json
{
  "type": "urn:circle-recommendations:error:invalid-limit",
  "title": "Invalid recommendation request",
  "status": 400,
  "code": "INVALID_LIMIT",
  "detail": "limit must be one integer between 1 and 10.",
  "request_id": "7037db9a-7e8f-4535-adcf-4f29f5e68836",
  "errors": [
    {
      "field": "limit",
      "message": "limit must be one integer between 1 and 10."
    }
  ]
}
```

Common statuses are `400` for invalid input, `404` for an unknown user or route, `405` for unsupported methods, and `500` for an unexpected server failure.

## Recommendation approach

### Eligibility

A Circle is excluded before scoring when:

- The user is already a member.
- `max_members` is non-null and `member_count >= max_members`.
- `access` is `unlisted`.
- It is inactive.

Inactivity is evaluated against the fixed dataset snapshot, not the current clock. A Circle is inactive only when its last activity is more than 90 days before `2026-09-21`, it has zero feed posts in 30 days, and it has fewer than five chat messages in 30 days. This keeps chat-active Circles eligible even when feed activity is low.

### Personalized scoring

For users with stated topic interests, scores range from 0 to 100:

| Signal | Weight |
| --- | ---: |
| Exact primary-topic match | 50 |
| Secondary tag overlap | 10 |
| Feed activity | 8 |
| Chat activity | 7 |
| Engagement | 8 |
| Available capacity | 6 |
| Bounded popularity | 6 |
| Open join policy | 5 |

Topic relevance therefore dominates activity and popularity. Activity, engagement, capacity, and popularity use bounded or logarithmic normalization so raw counts cannot overwhelm relevance. Request-to-join Circles remain eligible but do not receive the open-policy points.

Names, photos, biographies, profile completeness, job details, companies, industries, locations, Circle age, membership tenure, and inferred identity are not scoring signals.

### Cold start

Users without topic interests receive a separate quality-based score:

| Signal | Weight |
| --- | ---: |
| Feed activity | 20 |
| Chat activity | 20 |
| Engagement | 20 |
| Available capacity | 15 |
| Bounded popularity | 15 |
| Open join policy | 10 |

Cold-start responses contain no topic matches and do not claim personal relevance.

### Duplicate handling and diversification

Potential duplicates must share a non-null primary topic and have description-token Jaccard similarity of at least `0.85`. They must also have either normalized-name similarity of at least `0.50` or tag similarity of at least `0.67`. Matching pairs are combined into connected clusters.

The highest-ranked Circle from each duplicate cluster is considered first. Personalized lists cover distinct exact interests before allowing up to two results per topic. Cold-start lists first allow one result per topic, then up to two. A second member of a duplicate cluster is used only when unique alternatives cannot fill the requested limit; no more than two cluster members are returned.

The raw candidate order is deterministic: score descending, most recent activity, member count, then Circle ID. Diversification preserves deterministic scan and backfill order.

### Explanations

Explanations are generated from record-backed facts only: primary and secondary topic matches, recent activity, available capacity, and approval requirements. They never contain internal scores, sensitive profile attributes, or promises about career outcomes.

## Database schema approach

The API uses the supplied JSON files in memory for a portable, dependency-free take-home implementation. Startup validation checks shapes, IDs, relationships, enums, counters, timestamps, membership counts, leaders, and activity authors. Duplicate Circle tags are normalized in memory; the source data is never modified.

`schema.sql` provides the normalized SQLite design for a production-oriented relational model:

- `topics`
- `users`
- `user_topic_interests`
- `circles`
- `circle_tags`
- `memberships`
- `activity`

It includes primary keys, foreign keys, uniqueness constraints, enum checks, nonnegative-count checks, and supporting indexes. SQLite is not required at runtime.

## Project structure

```text
data/                              Synthetic JSON seed data
src/
  app.js                           HTTP routing and request validation
  config.js                        Snapshot, limits, and scoring weights
  server.js                        Server entry point
  data/load-data.js                Startup loading, validation, and indexes
  http/problem-details.js          JSON and Problem Details responses
  recommendation/
    duplicate-detection.js         Similarity and duplicate clustering
    diversification.js             Final-list selection and backfill
    eligibility.js                 Candidate filters
    explanations.js                Fact-based member explanations
    recommendation-service.js      Recommendation orchestration
    scoring.js                     Signal normalization and scoring
test/                              API, engine, boundary, and schema tests
schema.sql                         Normalized SQLite schema
generate.mjs                       Deterministic seed-data generator
```

## Assumptions and limitations

- The dataset is fully synthetic and represents a snapshot at `2026-09-21T00:00:00.000Z`.
- The service is read-only and has no authentication, persistence, or recommendation-feedback loop.
- `unlisted` Circles are treated as undiscoverable.
- A null `max_members` value means uncapped.
- Topic slugs and free-form tags provide enough semantic information for this exercise; no embeddings are used.
- Chat content is unavailable, so chat activity is represented only by aggregate volume.
- The fixed weights and similarity thresholds are deterministic product choices, not values learned from outcome data.
