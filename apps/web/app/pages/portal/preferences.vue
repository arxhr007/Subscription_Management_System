<script setup lang="ts">
const api=useApi(),toast=useToast()
const {data,refresh}=useFetch<any>('/api/advisor/profile')
const form=ref({name:'',occupation:'OTHER',interests:[] as string[],activities:'',budget:'',notifications:true})
watchEffect(()=>{if(data.value)form.value={name:data.value.name,occupation:data.value.occupation,interests:[...data.value.interests],activities:data.value.activities,budget:data.value.budget==null?'':String(data.value.budget/100),notifications:data.value.notifications}})
const input=ref(''),busy=ref(false)
function add(v:string){const t=v.trim();if(t&&!form.value.interests.includes(t))form.value.interests.push(t);input.value=''}
async function save(){busy.value=true;try{await api('/advisor/profile',{method:'PUT',body:{...form.value,budget:form.value.budget===''||form.value.budget==null?null:Number(form.value.budget)}});await refresh();toast.add({title:'Preferences saved',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=false}}
</script>
<template>
 <div class="page max-w-2xl space-y-6">
  <div class="page-head"><div><p class="eyebrow">Make it personal</p><h1>Your priorities. Your rules.</h1><p>Keep your budget, interests and activities up to date.</p></div></div>
  <section><form class="space-y-5" @submit.prevent="save">
   <UFormField label="Name"><UInput v-model="form.name" class="w-full"/></UFormField>
   <UFormField label="Occupation"><USelect v-model="form.occupation" :items="[{label:'Student',value:'STUDENT'},{label:'Professional',value:'PROFESSIONAL'},{label:'Freelancer / creator',value:'FREELANCER'},{label:'Other',value:'OTHER'}]" class="w-full"/></UFormField>
   <UFormField label="Interests"><div class="flex flex-wrap gap-2 mb-3"><UBadge v-for="i in form.interests" :key="i" variant="subtle">{{i}}<button @click="form.interests=form.interests.filter(x=>x!==i)">×</button></UBadge></div><div class="flex gap-2"><UInput v-model="input" class="flex-1" placeholder="Add interest" @keyup.enter.prevent="add(input)"/><UButton color="neutral" variant="outline" @click="add(input)">Add</UButton></div></UFormField>
   <UFormField label="Life right now"><UTextarea v-model="form.activities" class="w-full"/></UFormField>
   <UFormField label="Monthly budget (₹)"><UInput v-model="form.budget" type="number" min="0" step="0.01" class="w-full"/></UFormField>
   <UCheckbox v-model="form.notifications" label="Contextual reminders before renewals and activities"/>
   <UButton type="submit" :loading="busy">Save preferences</UButton>
  </form></section>
  <section class="border-t border-default pt-6"><p class="font-medium">Setup</p><UButton class="mt-4" icon="i-lucide-wand-sparkles" to="/portal/onboarding">Run quick setup again</UButton></section>
  <section class="border-t border-default pt-6"><p class="font-medium">Connections</p><div class="flex gap-2 mt-4"><UButton color="neutral" variant="outline" to="/portal/subscriptions">Subscriptions</UButton><UButton color="neutral" variant="outline" to="/portal/timeline">Calendar & timeline</UButton></div></section>
 </div>
</template>
