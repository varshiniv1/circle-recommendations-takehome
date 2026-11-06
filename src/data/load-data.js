import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIRECTORY = join(HERE, '..', '..', 'data');
const FILES = ['topics', 'users', 'circles', 'memberships', 'activity'];

export class DataValidationError extends Error {
  constructor(errors) {
    super(`Seed data validation failed: ${errors[0] ?? 'unknown error'}`);
    this.name = 'DataValidationError';
    this.errors = errors;
  }
}

const isInteger = (value) => Number.isSafeInteger(value);
const isNonNegativeInteger = (value) => isInteger(value) && value >= 0;
const isNullableString = (value) => value === null || typeof value === 'string';
const isIsoDate = (value) =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;

function validateRequiredFields(record, fields, path, errors) {
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) errors.push(`${path}.${field} is required`);
  }
}

function validateUniqueIds(records, entity, errors) {
  const seen = new Set();
  for (const [index, record] of records.entries()) {
    if (!isInteger(record.id) || record.id <= 0) {
      errors.push(`${entity}[${index}].id must be a positive safe integer`);
    } else if (seen.has(record.id)) {
      errors.push(`${entity} contains duplicate id ${record.id}`);
    }
    seen.add(record.id);
  }
}

function validateTopics(topics, errors) {
  validateUniqueIds(topics, 'topics', errors);
  const slugs = new Set();
  for (const [index, topic] of topics.entries()) {
    const path = `topics[${index}]`;
    validateRequiredFields(topic, ['id', 'slug', 'label', 'domain'], path, errors);
    if (typeof topic.slug !== 'string' || topic.slug.length === 0) errors.push(`${path}.slug must be a non-empty string`);
    if (slugs.has(topic.slug)) errors.push(`topics contains duplicate slug ${topic.slug}`);
    slugs.add(topic.slug);
    if (typeof topic.label !== 'string' || topic.label.length === 0) errors.push(`${path}.label must be a non-empty string`);
    if (topic.domain !== 'content') errors.push(`${path}.domain must be content`);
  }
  return slugs;
}

function validateUsers(users, topicSlugs, errors) {
  validateUniqueIds(users, 'users', errors);
  for (const [index, user] of users.entries()) {
    const path = `users[${index}]`;
    validateRequiredFields(user, [
      'id', 'first_name', 'last_name', 'has_photo', 'bio', 'job_title',
      'company', 'industry', 'location', 'joined_at', 'topic_interests',
      'profile_completeness',
    ], path, errors);
    if (typeof user.first_name !== 'string' || typeof user.last_name !== 'string') errors.push(`${path} names must be strings`);
    if (typeof user.has_photo !== 'boolean') errors.push(`${path}.has_photo must be boolean`);
    for (const field of ['bio', 'job_title', 'company', 'industry', 'location']) {
      if (!isNullableString(user[field])) errors.push(`${path}.${field} must be a string or null`);
    }
    if (!isIsoDate(user.joined_at)) errors.push(`${path}.joined_at must be an ISO UTC date`);
    if (!Array.isArray(user.topic_interests)) {
      errors.push(`${path}.topic_interests must be an array`);
    } else {
      const seen = new Set();
      for (const slug of user.topic_interests) {
        if (!topicSlugs.has(slug)) errors.push(`${path}.topic_interests contains unknown topic ${slug}`);
        if (seen.has(slug)) errors.push(`${path}.topic_interests contains duplicate topic ${slug}`);
        seen.add(slug);
      }
    }
    if (typeof user.profile_completeness !== 'number' || user.profile_completeness < 0 || user.profile_completeness > 1) {
      errors.push(`${path}.profile_completeness must be between 0 and 1`);
    }
  }
}

function validateCircles(circles, topicSlugs, errors) {
  validateUniqueIds(circles, 'circles', errors);
  const slugs = new Set();
  for (const [index, circle] of circles.entries()) {
    const path = `circles[${index}]`;
    validateRequiredFields(circle, [
      'id', 'name', 'slug', 'description', 'topic', 'tags', 'cover_image_url',
      'format', 'access', 'join_policy', 'max_members', 'member_count',
      'created_at', 'last_activity_at', 'feed_posts_30d', 'chat_messages_30d',
    ], path, errors);
    if (typeof circle.name !== 'string' || circle.name.length === 0) errors.push(`${path}.name must be a non-empty string`);
    if (typeof circle.slug !== 'string' || circle.slug.length === 0) errors.push(`${path}.slug must be a non-empty string`);
    if (slugs.has(circle.slug)) errors.push(`circles contains duplicate slug ${circle.slug}`);
    slugs.add(circle.slug);
    if (!isNullableString(circle.description)) errors.push(`${path}.description must be a string or null`);
    if (circle.topic !== null && !topicSlugs.has(circle.topic)) errors.push(`${path}.topic contains unknown topic ${circle.topic}`);
    if (!Array.isArray(circle.tags)) errors.push(`${path}.tags must be an array`);
    else for (const tag of circle.tags) if (!topicSlugs.has(tag)) errors.push(`${path}.tags contains unknown topic ${tag}`);
    if (!isNullableString(circle.cover_image_url)) errors.push(`${path}.cover_image_url must be a string or null`);
    if (!['in_person', 'virtual', 'hybrid'].includes(circle.format)) errors.push(`${path}.format is invalid`);
    if (!['public', 'unlisted'].includes(circle.access)) errors.push(`${path}.access is invalid`);
    if (!['open', 'request'].includes(circle.join_policy)) errors.push(`${path}.join_policy is invalid`);
    if (circle.max_members !== null && !isNonNegativeInteger(circle.max_members)) errors.push(`${path}.max_members must be a non-negative integer or null`);
    for (const field of ['member_count', 'feed_posts_30d', 'chat_messages_30d']) {
      if (!isNonNegativeInteger(circle[field])) errors.push(`${path}.${field} must be a non-negative integer`);
    }
    if (!isIsoDate(circle.created_at)) errors.push(`${path}.created_at must be an ISO UTC date`);
    if (!isIsoDate(circle.last_activity_at)) errors.push(`${path}.last_activity_at must be an ISO UTC date`);
  }
}

function validateRelationships(data, errors) {
  const userIds = new Set(data.users.map((user) => user.id));
  const circleIds = new Set(data.circles.map((circle) => circle.id));
  const membershipKeys = new Set();
  const memberCounts = new Map();
  const leaderCounts = new Map();

  for (const [index, membership] of data.memberships.entries()) {
    const path = `memberships[${index}]`;
    validateRequiredFields(membership, ['user_id', 'circle_id', 'role', 'joined_at'], path, errors);
    if (!userIds.has(membership.user_id)) errors.push(`${path}.user_id is unknown`);
    if (!circleIds.has(membership.circle_id)) errors.push(`${path}.circle_id is unknown`);
    if (!['member', 'leader'].includes(membership.role)) errors.push(`${path}.role is invalid`);
    if (!isIsoDate(membership.joined_at)) errors.push(`${path}.joined_at must be an ISO UTC date`);
    const key = `${membership.user_id}:${membership.circle_id}`;
    if (membershipKeys.has(key)) errors.push(`memberships contains duplicate pair ${key}`);
    membershipKeys.add(key);
    memberCounts.set(membership.circle_id, (memberCounts.get(membership.circle_id) ?? 0) + 1);
    if (membership.role === 'leader') leaderCounts.set(membership.circle_id, (leaderCounts.get(membership.circle_id) ?? 0) + 1);
  }

  for (const circle of data.circles) {
    const actualCount = memberCounts.get(circle.id) ?? 0;
    if (circle.member_count !== actualCount) errors.push(`circle ${circle.id} member_count is ${circle.member_count}, expected ${actualCount}`);
    if ((leaderCounts.get(circle.id) ?? 0) !== 1) errors.push(`circle ${circle.id} must have exactly one leader`);
  }

  validateUniqueIds(data.activity, 'activity', errors);
  for (const [index, post] of data.activity.entries()) {
    const path = `activity[${index}]`;
    validateRequiredFields(post, [
      'id', 'circle_id', 'author_user_id', 'body', 'reaction_count',
      'comment_count', 'save_count', 'created_at',
    ], path, errors);
    if (!circleIds.has(post.circle_id)) errors.push(`${path}.circle_id is unknown`);
    if (!userIds.has(post.author_user_id)) errors.push(`${path}.author_user_id is unknown`);
    if (!membershipKeys.has(`${post.author_user_id}:${post.circle_id}`)) errors.push(`${path} author is not a Circle member`);
    if (typeof post.body !== 'string') errors.push(`${path}.body must be a string`);
    for (const field of ['reaction_count', 'comment_count', 'save_count']) {
      if (!isNonNegativeInteger(post[field])) errors.push(`${path}.${field} must be a non-negative integer`);
    }
    if (!isIsoDate(post.created_at)) errors.push(`${path}.created_at must be an ISO UTC date`);
  }
}

function buildIndexes(data) {
  const usersById = new Map(data.users.map((user) => [user.id, user]));
  const topicsBySlug = new Map(data.topics.map((topic) => [topic.slug, topic]));
  const membershipKeys = new Set(data.memberships.map((membership) => `${membership.user_id}:${membership.circle_id}`));
  const activityByCircle = new Map();
  for (const post of data.activity) {
    const posts = activityByCircle.get(post.circle_id) ?? [];
    posts.push(post);
    activityByCircle.set(post.circle_id, posts);
  }
  return { usersById, topicsBySlug, membershipKeys, activityByCircle };
}

export function validateData(rawData) {
  const errors = [];
  for (const file of FILES) {
    if (!Array.isArray(rawData[file])) errors.push(`${file}.json must contain a top-level array`);
  }
  if (errors.length) throw new DataValidationError(errors);

  for (const file of FILES) {
    for (const [index, record] of rawData[file].entries()) {
      if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        errors.push(`${file}[${index}] must be an object`);
      }
    }
  }
  if (errors.length) throw new DataValidationError(errors);

  const topicSlugs = validateTopics(rawData.topics, errors);
  validateUsers(rawData.users, topicSlugs, errors);
  validateCircles(rawData.circles, topicSlugs, errors);
  validateRelationships(rawData, errors);
  if (errors.length) throw new DataValidationError(errors);

  const data = {
    ...rawData,
    circles: rawData.circles.map((circle) => ({ ...circle, tags: [...new Set(circle.tags)] })),
  };
  data.indexes = buildIndexes(data);
  return data;
}

export function loadData(dataDirectory = DEFAULT_DATA_DIRECTORY) {
  const rawData = {};
  for (const file of FILES) {
    const path = join(dataDirectory, `${file}.json`);
    try {
      rawData[file] = JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
      throw new DataValidationError([`${file}.json could not be loaded: ${error.message}`]);
    }
  }
  return validateData(rawData);
}
