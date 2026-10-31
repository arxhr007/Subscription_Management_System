import type { ErrorRequestHandler, RequestHandler } from 'express';
import { z } from 'zod';
import { fieldErrors } from '@brightloop/shared';
import { isUniqueViolation } from './db';

export class HttpError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) {
    super(message);
  }
}

export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);

/** Validates input with a shared schema; throws a 400 with per-field messages on failure. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.output<T> {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, 'Please fix the highlighted fields', fieldErrors(r.error));
  return r.data;
}

export const paging = (page: number, pageSize: number) => ({ skip: (page - 1) * pageSize, take: pageSize });

/** Adds X-Response-Time so the UI can show how fast each query was. */
export const timing: RequestHandler = (_req, res, next) => {
  const start = process.hrtime.bigint();
  const json = res.json.bind(res);
  res.json = (body) => {
    res.setHeader('X-Response-Time', (Number(process.hrtime.bigint() - start) / 1e6).toFixed(1));
    return json(body);
  };
  next();
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, fields: err.fields });
  if (isUniqueViolation(err)) {
    const target = String((err as { meta?: { target?: unknown } }).meta?.target ?? '');
    const field = target.includes('email') ? 'email' : undefined;
    return res.status(409).json({ error: field ? 'That email is already in use' : 'This record already exists', fields: field ? { email: 'That email is already in use' } : undefined });
  }
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Upload is too large' });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Malformed JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
};
