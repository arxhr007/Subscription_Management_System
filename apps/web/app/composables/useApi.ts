export function useApi() {
  return $fetch.create({ baseURL: '/api', credentials: 'include' })
}
export function errorMessage(error: unknown): string {
  const e = error as { data?: { error?: string }; message?: string }
  return e.data?.error || e.message || 'Something went wrong. Please try again.'
}
export function money(value: number = 0) { return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value / 100) }
export function date(value?: string | null) { return value ? new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—' }
