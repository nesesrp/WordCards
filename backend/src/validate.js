// Request validation. Error messages are Turkish because the frontend shows them.

import { LEVELS } from '../../frontend/js/presets.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (what) => new HttpError(404, `${what} bulunamadı.`);

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// A required, non-empty string (surrounding spaces are removed).
export function text(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, `${label} boş olamaz.`);
  }
  return value.trim();
}

// A CEFR level id ("A1" … "C2"), or null for no level.
export function level(value) {
  if (value === undefined || value === null || value === '') return null;
  if (!LEVELS.some((l) => l.id === value)) throw new HttpError(400, 'Geçersiz seviye.');
  return value;
}

export function body(req) {
  if (!isObject(req.body)) throw new HttpError(400, 'İstek gövdesi bir JSON nesnesi olmalı.');
  return req.body;
}
