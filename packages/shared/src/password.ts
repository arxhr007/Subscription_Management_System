export const PASSWORD_RULES = [
  { id: 'length', label: 'More than 8 characters', test: (p: string) => p.length > 8 },
  { id: 'upper', label: 'An uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'lower', label: 'A lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { id: 'special', label: 'A special character', test: (p: string) => /[^A-Za-z0-9\s]/.test(p) },
] as const;

export const failedPasswordRules = (p: string) => PASSWORD_RULES.filter((r) => !r.test(p));
export const isStrongPassword = (p: string) => failedPasswordRules(p).length === 0;
