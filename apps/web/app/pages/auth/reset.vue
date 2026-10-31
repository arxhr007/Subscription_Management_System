<script setup lang="ts">
import {PASSWORD_RULES} from '@brightloop/shared'
definePageMeta({ layout: false })
const password=ref(''),confirmPassword=ref(''),busy=ref(false),error=ref(''),done=ref(false),tokens=ref<{a:string;r:string}|null>(null)
onMounted(()=>{
 const hash=new URLSearchParams(location.hash.slice(1)),query=new URLSearchParams(location.search)
 const a=hash.get('access_token')||query.get('access_token'),r=hash.get('refresh_token')||query.get('refresh_token')
 if(a&&r)tokens.value={a,r};else error.value='This reset link is invalid or has expired. Request a new one.'
})
const failed=computed(()=>PASSWORD_RULES.filter(r=>!r.test(password.value)))
async function submit(){busy.value=true;error.value='';try{await useApi()('/auth/reset-password',{method:'POST',body:{accessToken:tokens.value!.a,refreshToken:tokens.value!.r,password:password.value,confirmPassword:confirmPassword.value}});done.value=true}catch(e){error.value=errorMessage(e)}finally{busy.value=false}}
</script>
<template><main class="min-h-screen flex justify-center items-center bg-elevated/30 p-6"><UCard class="w-full max-w-md"><h1 class="text-2xl font-semibold mb-2">Set a new password</h1><UAlert v-if="error" color="error" :title="error" class="mb-4"><template v-if="!tokens" #actions><UButton to="/forgot-password">Request a new link</UButton></template></UAlert><div v-if="done"><UAlert color="success" title="Password updated"/><UButton to="/login" block class="mt-4">Sign in</UButton></div><form v-else-if="tokens" class="space-y-4" @submit.prevent="submit"><UFormField label="New password"><UInput v-model="password" type="password" class="w-full" size="lg"/></UFormField><ul class="text-xs space-y-1"><li v-for="r in PASSWORD_RULES" :key="r.id" :class="password&&!failed.includes(r)?'text-success':'text-muted'">{{r.label}}</li></ul><UFormField label="Confirm password"><UInput v-model="confirmPassword" type="password" class="w-full" size="lg"/></UFormField><UButton type="submit" block size="lg" :loading="busy" :disabled="!!failed.length||password!==confirmPassword">Update password</UButton></form></UCard></main></template>
