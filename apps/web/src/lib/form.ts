// Form state + validation with the same Zod schema the API uses. Errors show on blur and on submit;
// server-side field errors (e.g. "email already in use") land on the same fields.
import { useState } from 'react';
import type { z } from 'zod';
import { fieldErrors } from '@brightloop/shared';
import { ApiError } from './api';

export function useForm<V extends Record<string, unknown>>(initial: V, schema?: z.ZodType) {
  const [values, setValues] = useState<V>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (v: V = values) => {
    if (!schema) return {};
    const r = schema.safeParse(v);
    return r.success ? {} : fieldErrors(r.error);
  };

  const set = <K extends keyof V>(key: K, value: V[K]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };
      if (touched[key as string] || errors[key as string]) {
        const e = validate(next);
        setErrors((old) => {
          const copy = { ...old };
          // Refresh this field's error and any nested ones (lines.0.quantity).
          for (const k of Object.keys(copy)) if (k === key || k.startsWith(`${String(key)}.`)) delete copy[k];
          for (const [k, m] of Object.entries(e)) if (k === key || k.startsWith(`${String(key)}.`)) copy[k] = m;
          return copy;
        });
      }
      return next;
    });
  };

  const blur = (key: keyof V & string) => {
    setTouched((t) => ({ ...t, [key]: true }));
    const e = validate();
    setErrors((old) => {
      const copy = { ...old };
      delete copy[key];
      if (e[key]) copy[key] = e[key];
      return copy;
    });
  };

  /** Validates, then runs `fn`; maps API errors back onto fields. Returns true on success. */
  const submit = async (fn: (v: V) => Promise<unknown>) => {
    setFormError(null);
    const e = validate();
    setErrors(e);
    setTouched(Object.fromEntries(Object.keys(values).map((k) => [k, true])));
    if (Object.keys(e).length) { setFormError('Please fix the highlighted fields.'); return false; }
    setSubmitting(true);
    try {
      await fn(values);
      return true;
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fields);
        setFormError(err.message);
      } else setFormError('Something went wrong. Please try again.');
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  return { values, set, setValues, errors, setErrors, blur, submit, submitting, formError, setFormError };
}
