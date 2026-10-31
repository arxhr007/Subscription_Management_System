<script setup lang="ts">
const api=useApi(),toast=useToast()
const {data,refresh,error}=await useFetch<any>('/api/advisor/overview')
const open=ref(false),busy=ref(false),err=ref('')
const form=ref({subscriptionId:'',activityId:null as string|null,reason:'',startDate:new Date().toISOString().slice(0,10),endDate:'' as string})
async function create(){busy.value=true;err.value='';try{await api('/advisor/intentions',{method:'POST',body:{...form.value,activityId:form.value.activityId||null,endDate:form.value.endDate||null}});open.value=false;await refresh();toast.add({title:'Intention saved. Nothing was purchased.',color:'success'})}catch(e){err.value=errorMessage(e)}finally{busy.value=false}}
async function setStatus(id:string,status:string){try{await api(`/advisor/intentions/${id}`,{method:'PATCH',body:{status}});await refresh();if(status==='DONE')toast.add({title:'Marked done — this does not activate anything. Update the service status yourself if you subscribed.',color:'neutral'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}}
</script>
<template>
 <div class="page space-y-6">
  <div class="flex flex-wrap justify-between gap-4"><div><h1 class="text-2xl font-semibold tracking-tight">Plans & intentions</h1><p class="text-sm text-muted mt-2">Say what you intend to start, when and why. Marking done never buys or activates a service.</p></div><UButton icon="i-lucide-plus" :disabled="!data?.subscriptions.length" @click="open=true">New intention</UButton></div>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"/>
  <p v-if="!data?.subscriptions.length" class="text-sm text-muted">Add a subscription first (Active, Planned or Interested), then plan when to start it.</p>
  <div class="overflow-x-auto">
   <table class="w-full text-sm">
    <thead><tr class="text-left text-muted border-b border-default"><th class="py-2.5 pe-4 font-medium">Service</th><th class="py-2.5 pe-4 font-medium hidden md:table-cell">Why</th><th class="py-2.5 pe-4 font-medium">When</th><th class="py-2.5 pe-4 font-medium hidden sm:table-cell">Est. cost</th><th class="py-2.5 pe-4 font-medium">Status</th><th class="py-2.5"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody class="divide-y divide-default">
     <tr v-for="i in data?.intentions||[]" :key="i.id" class="hover:bg-elevated/40">
      <td class="py-3.5 pe-4 font-medium">{{i.subscription?.name}}<span class="block md:hidden text-xs text-muted font-normal mt-0.5">{{i.reason}}</span></td>
      <td class="py-3.5 pe-4 text-muted hidden md:table-cell max-w-64 truncate">{{i.reason}}</td>
      <td class="py-3.5 pe-4 whitespace-nowrap">{{date(i.startDate)}}{{i.endDate?' → '+date(i.endDate):''}}<span v-if="i.activity" class="block text-xs text-muted">{{i.activity.title}}</span></td>
      <td class="py-3.5 pe-4 hidden sm:table-cell tabular-nums">{{money(i.subscription?.amount)}}/{{i.subscription?.interval?.toLowerCase()}}</td>
      <td class="py-3.5 pe-4"><UBadge variant="subtle" size="sm" :color="i.status==='DONE'?'success':i.status==='DISMISSED'?'neutral':'primary'">{{i.status}}</UBadge></td>
      <td class="py-3.5 text-right whitespace-nowrap"><template v-if="i.status==='PLANNED'"><UButton size="xs" @click="setStatus(i.id,'DONE')">Mark done</UButton> <UButton size="xs" color="neutral" variant="ghost" @click="setStatus(i.id,'DISMISSED')">Dismiss</UButton></template></td>
     </tr>
    </tbody>
   </table>
   <p v-if="data&&!data.intentions.length" class="text-sm text-muted py-10 text-center">No intentions yet. Example: “Start the design tool in March for my portfolio project.”</p>
  </div>
  <USlideover v-model:open="open" title="New intention" description="A plan, not a purchase. You subscribe at the provider yourself."><template #body><form id="intent-form" class="space-y-5" @submit.prevent="create"><UAlert v-if="err" color="error" :title="err"/><UFormField label="Service" required><USelect v-model="form.subscriptionId" :items="(data?.subscriptions||[]).map((s:any)=>({label:`${s.name} (${s.status.toLowerCase()})`,value:s.id}))" placeholder="Choose a service" class="w-full"/></UFormField><UFormField label="Why?"><UTextarea v-model="form.reason" class="w-full" placeholder="Reason for starting"/></UFormField><UFormField label="Related activity"><USelect v-model="form.activityId" :items="[{label:'None',value:null},...(data?.activities||[]).map((a:any)=>({label:a.title,value:a.id}))]" class="w-full"/></UFormField><div class="grid grid-cols-2 gap-4"><UFormField label="Planned start"><UInput v-model="form.startDate" type="date" class="w-full"/></UFormField><UFormField label="Planned end (optional)"><UInput v-model="form.endDate" type="date" class="w-full"/></UFormField></div></form></template><template #footer><div class="flex justify-end gap-2 w-full"><UButton color="neutral" variant="ghost" @click="open=false">Cancel</UButton><UButton type="submit" form="intent-form" :loading="busy">Save intention</UButton></div></template></USlideover>
 </div>
</template>
