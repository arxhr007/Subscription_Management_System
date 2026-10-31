<script setup lang="ts">
const api=useApi(),toast=useToast(),route=useRoute()
const {data,refresh,error}=await useFetch<any>('/api/advisor/overview')
const {data:cal,refresh:refreshCal}=await useFetch<any>('/api/calendar')
const range=ref(30),busy=ref(false),msg=ref(route.query.calendar_error?'Calendar connection did not complete. Check the same Google account and permission.':route.query.calendar_connected?'Google Calendar connected. Sync to import activities.':'')
const selectedDay=ref(''),kindFilter=ref('ALL')
const presentKinds=computed<string[]>(()=>['ALL',...new Set<string>((data.value?.activities||[]).map((a:any)=>String(a.kind)))])
const calEvents=computed(()=>[
 ...(data.value?.renewals||[]).map((r:any)=>({date:r.date,title:`${r.title} · ${money(r.amount)}`,type:'RENEWAL' as const})),
 ...(data.value?.activities||[]).map((a:any)=>({date:a.startDate,end:a.endDate,title:a.title,type:'ACTIVITY' as const})),
 ...(data.value?.intentions||[]).filter((i:any)=>i.status==='PLANNED').map((i:any)=>({date:i.startDate,title:`Start: ${i.subscription?.name||'service'}`,type:'INTENTION' as const})),
])
const dayEvents=computed(()=>selectedDay.value?events.value.filter(e=>new Date(e.date).toDateString()===selectedDay.value):[])
const open=ref(false),editing=ref(''),form=ref({title:'',description:'',kind:'OTHER',startDate:new Date().toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10)})
const kinds=['EXAM','PROJECT','HACKATHON','VACATION','TRAVEL','LEARNING','WORK','RELEASE','OTHER']
const horizon=computed(()=>new Date(Date.now()+range.value*86400000))
const events=computed(()=>{
 const list:any[]=[]
 for(const a of data.value?.activities||[])list.push({id:'a'+a.id,date:a.startDate,end:a.endDate,title:a.title,detail:`${a.kind.charAt(0)+a.kind.slice(1).toLowerCase()}${a.source==='GOOGLE'?' · from Google Calendar (type inferred — correct it if wrong)':' · manual'}`,type:'Activity',raw:a})
 for(const r of data.value?.renewals||[])list.push({id:r.id,date:r.date,end:r.date,title:`${r.title} renews`,detail:money(r.amount),type:'Renewal'})
 for(const i of data.value?.intentions||[])if(i.status==='PLANNED')list.push({id:'i'+i.id,date:i.startDate,end:i.endDate||i.startDate,title:`Plan: ${i.subscription?.name||'Service'}`,detail:i.reason,type:'Intention'})
 return list.filter(e=>(kindFilter.value==='ALL'||e.type!=='Activity'||e.raw?.kind===kindFilter.value)&&new Date(e.end)>=new Date(new Date().setHours(0,0,0,0))&&new Date(e.date)<=horizon.value).sort((a,b)=>+new Date(a.date)-+new Date(b.date))
})
function edit(a?:any){editing.value=a?.id||'';form.value=a?{title:a.title,description:a.description||'',kind:a.kind,startDate:a.startDate.slice(0,10),endDate:a.endDate.slice(0,10)}:{title:'',description:'',kind:'OTHER',startDate:new Date().toISOString().slice(0,10),endDate:new Date().toISOString().slice(0,10)};open.value=true}
async function save(){busy.value=true;try{await api(`/advisor/activities${editing.value?'/'+editing.value:''}`,{method:editing.value?'PUT':'POST',body:form.value});open.value=false;await refresh();toast.add({title:'Activity saved',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=false}}
async function remove(a:any){if(!confirm(`Delete “${a.title}”?`))return;try{await api(`/advisor/activities/${a.id}`,{method:'DELETE'});await refresh()}catch(e){toast.add({title:errorMessage(e),color:'error'})}}
async function sync(){busy.value=true;try{const r=await api<any>('/calendar/sync',{method:'POST'});msg.value=`Imported ${r.imported} calendar activities.`;await Promise.all([refresh(),refreshCal()])}catch(e){msg.value=errorMessage(e)}finally{busy.value=false}}
async function disconnect(){busy.value=true;try{await api('/calendar',{method:'DELETE'});msg.value='Calendar disconnected and imported activities removed.';await Promise.all([refresh(),refreshCal()])}catch(e){msg.value=errorMessage(e)}finally{busy.value=false}}
</script>
<template>
 <div class="page space-y-6">
  <div class="flex flex-wrap justify-between gap-4"><div><h1 class="text-2xl font-semibold tracking-tight">Your life, your renewals, one timeline</h1></div><UButton icon="i-lucide-plus" @click="edit()">Add activity</UButton></div>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"/>
  <UAlert v-if="msg" color="neutral" :title="msg"/>
  <section class="border-y border-default py-4"><div class="flex flex-wrap justify-between items-center gap-4"><div><p class="font-medium">Google Calendar <UBadge v-if="cal?.connected" color="success" variant="subtle" class="ms-2">Connected</UBadge></p><p class="text-sm text-muted mt-1">Read-only. Never edits your calendar.</p></div><div class="flex gap-2"><UButton v-if="!cal?.connected" to="/api/auth/google?calendar=1" external icon="i-lucide-calendar-plus">Connect Calendar</UButton><template v-else><UButton :loading="busy" icon="i-lucide-refresh-cw" @click="sync">Sync now</UButton><UButton color="error" variant="ghost" :disabled="busy" @click="disconnect">Disconnect</UButton></template></div></div>
   <p class="text-xs text-muted mt-3">Use the same Google account as your login, approve, then Sync now. Blocked? Enable “Google Calendar API” and add your Gmail as a test user in Google Auth Platform → Audience.</p></section>
  <section><MiniCalendar :events="calEvents" :selected="selectedDay" @select-day="selectedDay=selectedDay===$event?'':$event"/>
   <div v-if="selectedDay" class="mt-4 border-t border-default pt-3"><p class="text-xs font-medium text-muted">{{new Date(selectedDay).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long'})}} <UButton size="xs" variant="link" @click="selectedDay=''">clear</UButton></p><p v-for="e in dayEvents" :key="e.id" class="text-sm mt-1.5">{{e.title}} <span class="text-muted">· {{e.type.toLowerCase()}}</span></p><p v-if="!dayEvents.length" class="text-sm text-muted mt-1.5">Nothing on this day.</p></div>
  </section>
  <div class="flex flex-wrap items-center gap-2"><span class="text-sm font-semibold me-2">Timeline</span><UButton v-for="r in [{label:'Week',value:7},{label:'Month',value:30},{label:'Quarter',value:90},{label:'Year',value:365}]" :key="r.value" size="sm" :color="range===r.value?'primary':'neutral'" :variant="range===r.value?'soft':'ghost'" @click="range=r.value">{{r.label}}</UButton><span class="text-xs text-muted ms-auto">soonest first · renewals within 7 days flagged</span></div><div class="flex flex-wrap gap-1.5 items-center"><span class="text-xs text-muted me-1">Events:</span><UButton v-for="k in presentKinds" :key="k" size="xs" :color="kindFilter===k?'primary':'neutral'" :variant="kindFilter===k?'soft':'ghost'" @click="kindFilter=k">{{k==='ALL'?'All categories':k.charAt(0)+k.slice(1).toLowerCase()}}</UButton><span class="text-xs text-dimmed ms-2">Wrong category? Tap Correct — syncs keep your fix.</span></div>
  <ol class="relative ms-3 border-s-2 border-default">
   <li v-for="e in events" :key="e.id" class="ms-6 pb-6 relative">
    <span class="absolute -start-[2.05rem] top-1 size-3 rounded-full ring-4 ring-[var(--ui-bg)]" :class="e.type==='Renewal'?'bg-primary':e.type==='Activity'?'bg-amber-500':'bg-sky-500'"/>
    <div class="flex flex-wrap justify-between gap-3 pb-1 border-b border-default">
     <div><p class="font-medium text-sm">{{e.title}} <UBadge v-if="e.type==='Renewal'&&new Date(e.date).getTime()-Date.now()<7*86400000" color="warning" variant="subtle" size="xs" class="ms-1">due soon</UBadge></p><p class="text-xs text-muted mt-1">{{date(e.date)}}{{e.end!==e.date?' → '+date(e.end):''}} · {{e.detail}}</p></div>
     <div class="flex items-start gap-2"><UBadge variant="subtle" color="neutral">{{e.type}}</UBadge><template v-if="e.raw"><UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" @click="edit(e.raw)">Correct</UButton><UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" @click="remove(e.raw)"/></template></div>
    </div>
   </li>
   <li v-if="!events.length" class="ms-6 py-8 text-sm text-muted">Nothing in this window. Add an activity or widen the range.</li>
  </ol>
  <USlideover v-model:open="open" :title="editing?'Edit activity':'Add activity'" description="Exams, projects, trips and learning periods help time your advice."><template #body><form id="act-form" class="space-y-5" @submit.prevent="save"><UFormField label="Title" required><UInput v-model="form.title" class="w-full"/></UFormField><UFormField label="Type"><USelect v-model="form.kind" :items="kinds.map(k=>({label:k.charAt(0)+k.slice(1).toLowerCase(),value:k}))" class="w-full"/></UFormField><div class="grid grid-cols-2 gap-4"><UFormField label="Starts"><UInput v-model="form.startDate" type="date" class="w-full"/></UFormField><UFormField label="Ends (inclusive)"><UInput v-model="form.endDate" type="date" class="w-full"/></UFormField></div><UFormField label="Notes"><UTextarea v-model="form.description" class="w-full"/></UFormField></form></template><template #footer><div class="flex justify-end gap-2 w-full"><UButton color="neutral" variant="ghost" @click="open=false">Cancel</UButton><UButton type="submit" form="act-form" :loading="busy">Save activity</UButton></div></template></USlideover>
 </div>
</template>
