<script setup lang="ts">
definePageMeta({layout:false})
const route=useRoute()
const failed=computed(()=>typeof route.query.error==='string')
onMounted(()=>{
  const message={type:'brightloop:google-complete',error:failed.value?String(route.query.error):undefined,at:Date.now()}
  try{localStorage.setItem('brightloop:google-complete',JSON.stringify(message))}catch{/* Parent also polls the session if storage is unavailable. */}
  if(window.opener){window.opener.postMessage(message,window.location.origin);window.close()}
})
</script>
<template><main class="min-h-screen flex items-center justify-center p-6"><UCard class="max-w-sm w-full text-center"><UIcon :name="failed?'i-lucide-circle-alert':'i-lucide-circle-check'" class="size-10 mb-4" :class="failed?'text-error':'text-success'"/><h1 class="text-xl font-semibold">{{failed?'Sign-in could not complete':'You’re signed in'}}</h1><p class="text-muted mt-3 text-sm">Return to your original Brightloop window. You can close this popup.</p><UButton v-if="failed" to="/login" class="mt-5" variant="outline">Back to sign in</UButton></UCard></main></template>
