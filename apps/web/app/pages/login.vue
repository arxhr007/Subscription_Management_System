<script setup lang="ts">
import { loginSchema } from '@brightloop/shared'
definePageMeta({ layout: false })
const { data: providers } = await useFetch<{google:boolean}>('/api/auth/providers')
const route = useRoute()
const oauthErrors: Record<string,string> = { expired:'Google sign-in expired. Please try again.', failed:'Google sign-in could not complete.', existing:'An account already exists. Sign in using your existing method or contact the administrator.', unverified:'Google did not provide a verified email.', unavailable:'Google sign-in is not available.' }
const state = reactive({ email: '', password: '' })
const busy = ref(false), error = ref(oauthErrors[String(route.query.oauth_error)] || '')
const { refresh } = useAuth()
const googleBusy = ref(false)
let popup: Window | null = null
let timer: ReturnType<typeof setInterval> | undefined
let deadline: ReturnType<typeof setTimeout> | undefined
let finishing = false
function stopGoogle() { clearInterval(timer); clearTimeout(deadline); googleBusy.value=false }
async function completeGoogle(reason?: string) {
  if (finishing) return
  if (reason) { error.value=oauthErrors[reason] || 'Google sign-in did not complete.'; stopGoogle(); return }
  finishing=true
  try {
    const user=await refresh()
    if(user) { stopGoogle(); popup?.close(); await navigateTo('/portal') }
  } catch { /* Wait for completion or show the timeout below. */ }
  finally { finishing=false }
}
function onGoogleMessage(event:MessageEvent) {
  if(event.origin!==window.location.origin || event.source!==popup || event.data?.type!=='brightloop:google-complete')return
  void completeGoogle(event.data.error)
}
function onGoogleStorage(event:StorageEvent) {
  if(event.key!=='brightloop:google-complete' || !event.newValue || !googleBusy.value)return
  try { const result=JSON.parse(event.newValue); if(Date.now()-result.at<120000)void completeGoogle(result.error) } catch { /* Ignore unrelated storage data. */ }
}
function googleSignIn() {
  error.value=''
  const width=500,height=650
  popup=window.open('/api/auth/google?popup=1','brightloop-google',`popup=yes,width=${width},height=${height},left=${Math.max(0,window.screenX+(window.outerWidth-width)/2)},top=${Math.max(0,window.screenY+(window.outerHeight-height)/2)}`)
  if(!popup){error.value='Your browser blocked the sign-in popup. Allow popups for this site and try again.';return}
  googleBusy.value=true;popup.focus()
  // Poll the app session as a fallback when an identity provider severs window.opener.
  timer=setInterval(()=>void completeGoogle(),2500)
  deadline=setTimeout(()=>{stopGoogle();error.value='Sign-in timed out or was cancelled. Please try again.'},120000)
}
onMounted(()=>{window.addEventListener('message',onGoogleMessage);window.addEventListener('storage',onGoogleStorage)})
onUnmounted(()=>{stopGoogle();window.removeEventListener('message',onGoogleMessage);window.removeEventListener('storage',onGoogleStorage)})

async function submit() {
  busy.value = true; error.value = ''
  try { await useApi()('/auth/login', { method: 'POST', body: state }); const user = await refresh(); await navigateTo('/portal') }
  catch(e) { error.value = errorMessage(e) } finally { busy.value = false }
}
</script>
<template><main class="min-h-screen grid lg:grid-cols-2"><section class="hidden lg:flex bg-muted text-highlighted p-16 flex-col justify-between"><div class="text-2xl font-semibold flex gap-3 items-center"><UIcon name="i-lucide-orbit" />brightloop.</div><div><p class="text-primary uppercase tracking-widest text-sm mb-6">A clearer view of your business</p><h1 class="text-5xl font-semibold leading-tight tracking-tight max-w-lg">Every subscription.<br>Every payment.<br>One workspace.</h1><p class="text-muted mt-8 max-w-md">Keep billing on track and give your team the clarity to move forward.</p></div><p class="text-sm text-muted">Built for the way recurring businesses work.</p></section><section class="flex items-center justify-center p-6"><div class="w-full max-w-sm"><UBadge variant="subtle" class="mb-6">Brightloop workspace</UBadge><h2 class="text-3xl font-semibold tracking-tight">Welcome back</h2><p class="text-muted mt-2 mb-8">Sign in to manage your subscriptions.</p><UAlert v-if="error" color="error" :title="error" class="mb-5" /><button v-if="providers?.google" type="button" class="google-button" :disabled="googleBusy" @click="googleSignIn"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.87 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg><span>{{googleBusy?'Signing in…':'Continue with Google'}}</span></button><UForm :schema="loginSchema" :state="state" class="space-y-5" @submit="submit"><UFormField name="email" label="Email address"><UInput v-model="state.email" type="email" autocomplete="username" class="w-full" size="lg" /></UFormField><UFormField name="password" label="Password"><UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" size="lg" /></UFormField><UButton type="submit" block size="lg" :loading="busy">Sign in</UButton></UForm><p class="mt-6 text-sm text-muted">New customer? <NuxtLink to="/signup" class="text-primary font-medium">Create an account</NuxtLink></p><p class="text-xs text-muted mt-5">Need account recovery? Contact your workspace administrator.</p></div></section></main></template>

<style scoped>
.google-button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;height:44px;padding:0 12px;margin-bottom:20px;border:1px solid #747775;border-radius:4px;background:#fff;color:#1f1f1f;font-family:Arial,sans-serif;font-size:14px;font-weight:500;letter-spacing:.25px;cursor:pointer;transition:background .15s,box-shadow .15s}
.google-button:hover{background:#f8faff;box-shadow:0 1px 3px #0002}.google-button:focus-visible{outline:3px solid #4285f4;outline-offset:3px}.google-button:disabled{cursor:wait;opacity:.65}.google-button svg{flex-shrink:0}
</style>
