export default defineNuxtRouteMiddleware(async to => {
  if (['/login', '/signup', '/auth/complete'].includes(to.path)) return
  const { user, refresh } = useAuth()
  if (!user.value) { try { await refresh() } catch { return navigateTo('/login') } }
  if (!user.value) return navigateTo('/login')
  if (user.value.role === 'CUSTOMER' && !to.path.startsWith('/portal')) return navigateTo('/portal')
  if (user.value.role !== 'CUSTOMER' && to.path.startsWith('/portal')) return navigateTo('/')
  if (to.path === '/team' && user.value.role !== 'ADMIN') return navigateTo('/')
})
