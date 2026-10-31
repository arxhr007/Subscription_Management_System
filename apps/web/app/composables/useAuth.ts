export interface User { id: string; role: 'ADMIN' | 'STAFF' | 'CUSTOMER'; name: string; email: string; customerId: string | null }
export function useAuth() {
  const user = useState<User | null>('user', () => null)
  const api = useApi()
  async function refresh() {
    try { user.value = await api<User>('/auth/me') }
    catch (e) { user.value = null; if ((e as { status?: number }).status !== 401) throw e }
    return user.value
  }
  async function logout() { await api('/auth/logout', { method: 'POST' }); user.value = null; clearNuxtData(); await navigateTo('/login') }
  return { user, refresh, logout }
}
