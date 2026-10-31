export default defineEventHandler(event => {
  const origin = useRuntimeConfig(event).apiOrigin.replace(/\/$/, '')
  return proxyRequest(event, `${origin}${event.path}`, { fetchOptions: { redirect: 'manual' } })
})
