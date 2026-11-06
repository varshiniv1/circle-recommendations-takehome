export const SNAPSHOT_AT = '2026-09-21T00:00:00.000Z';
export const INACTIVITY_DAYS = 90;
export const ENGAGEMENT_WINDOW_DAYS = 30;

export const DEFAULT_LIMIT = 5;
export const MAX_LIMIT = 10;

export const PERSONALIZED_WEIGHTS = Object.freeze({
  primary: 50,
  tag: 10,
  feed: 8,
  chat: 7,
  engagement: 8,
  availability: 6,
  popularity: 6,
  join: 5,
});

export const COLD_START_WEIGHTS = Object.freeze({
  primary: 0,
  tag: 0,
  feed: 20,
  chat: 20,
  engagement: 20,
  availability: 15,
  popularity: 15,
  join: 10,
});
