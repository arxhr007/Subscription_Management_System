<script setup lang="ts">
const api=useApi(),toast=useToast()
interface Rec{key:string;action:string;title:string;reason:string;activity:string|null;financialImpact:string;potentialMonthly:number;ifIgnored:string;subscriptionId:string;date:string|null;priority:number}
const {data,refresh,error}=await useFetch<any>('/api/advisor/overview')
const {data:calStatus,refresh:refreshCalStatus}=await useFetch<any>('/api/calendar')
async function syncCal(){try{await useApi()('/calendar/sync',{method:'POST'});await Promise.all([refresh(),refreshCalStatus()]);toast.add({title:'Calendar synced',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}}
const busy=ref(''),expanded=ref('')
const labels:Record<string,string>={KEEP:'Keep',RECONSIDER:'Review',SUBSCRIBE:'Consider starting',DELAY:'Delay',OVERLAP:'Rotate'}
const colors:Record<string,string>={KEEP:'success',RECONSIDER:'warning',SUBSCRIBE:'primary',DELAY:'neutral',OVERLAP:'neutral'}
const prio=(p:number)=>p>=85?{label:'Urgent',color:'error'}:p>=60?{label:'Soon',color:'warning'}:p>=40?{label:'Planned',color:'primary'}:{label:'Low',color:'neutral'}
async function feedback(key:string,action:string){busy.value=key+action;try{await api('/advisor/feedback',{method:'POST',body:{recommendationKey:key,action}});await refresh();toast.add({title:action==='HELPFUL'?'Thanks — noted':'Advice updated',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=''}}
const calEvents=computed(()=>[
 ...(data.value?.renewals||[]).map((r:any)=>({date:r.date,title:`${r.title} · ${money(r.amount)}`,type:'RENEWAL' as const})),
 ...(data.value?.activities||[]).map((a:any)=>({date:a.startDate,end:a.endDate,title:a.title,type:'ACTIVITY' as const})),
 ...(data.value?.intentions||[]).filter((i:any)=>i.status==='PLANNED').map((i:any)=>({date:i.startDate,title:`Start: ${i.subscription?.name||'service'}`,type:'INTENTION' as const})),
])
const upcoming=computed(()=>calEvents.value.filter(e=>new Date(e.date)>=new Date(new Date().setHours(0,0,0,0))).sort((a,b)=>+new Date(a.date)-+new Date(b.date)).slice(0,7))
const selectedDay=ref('')
const dayEvents=computed(()=>selectedDay.value?calEvents.value.filter(e=>new Date(e.date).toDateString()===selectedDay.value):[])
</script>
<template>
 <div class="page space-y-6">
  <div class="flex flex-wrap items-end justify-between gap-3">
   <div><h1 class="text-2xl font-semibold tracking-tight">What needs your attention?</h1></div>
   <div class="flex gap-5 text-right">
    <div><p class="text-xs text-muted">Active / mo</p><p class="text-xl font-semibold tabular-nums">{{data?money(data.totals.monthly):'—'}}</p></div>
    <div><p class="text-xs text-muted">Potential saving*</p><p class="text-xl font-semibold tabular-nums">{{data?money(data.totals.potentialMonthly):'—'}}</p></div>
    <div><p class="text-xs text-muted">Active subs</p><p class="text-xl font-semibold">{{data?.totals.active??'—'}}</p></div>
   </div>
  </div>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"><template #actions><UButton @click="refresh()">Try again</UButton></template></UAlert>
  <template v-if="data">
   <div v-if="!data.subscriptions.length" class="border-y border-dashed border-default py-5 flex flex-wrap justify-between gap-4 items-center"><div><p class="font-medium">No services yet.</p></div><UButton to="/portal/subscriptions" trailing-icon="i-lucide-arrow-right">Add subscriptions</UButton></div>
   <div class="grid lg:grid-cols-5 gap-6 items-start">
    <section class="lg:col-span-3">
     <header class="flex items-center justify-between py-3 border-b-2 border-default"><h2 class="font-semibold">Priority actions</h2><span class="text-xs text-muted">{{data.recommendations.length}} · sorted by urgency</span></header>
     <ol class="divide-y divide-default">
      <li v-for="(r,i) in (data.recommendations as Rec[])" :key="r.key" class="py-4 hover:bg-elevated/30">
       <div class="flex gap-4">
        <span class="text-sm font-semibold text-dimmed tabular-nums pt-0.5 w-6">{{i+1}}</span>
        <div class="flex-1 min-w-0">
         <div class="flex flex-wrap items-center gap-2">
          <UBadge :color="prio(r.priority).color as any" variant="subtle" size="sm">{{prio(r.priority).label}} · {{r.priority}}</UBadge>
          <UBadge :color="colors[r.action] as any" variant="outline" size="sm">{{labels[r.action]}}</UBadge>
          <span v-if="r.date" class="text-xs text-muted">{{date(r.date)}}</span>
         </div>
         <button class="font-medium text-left mt-1.5 hover:text-primary" @click="expanded=expanded===r.key?'':r.key">{{r.title}} <UIcon :name="expanded===r.key?'i-lucide-chevron-up':'i-lucide-chevron-down'" class="size-4 align-middle text-dimmed"/></button>
         <p class="text-sm text-muted leading-6 mt-1">{{r.reason}}</p>
         <div v-if="expanded===r.key" class="grid sm:grid-cols-2 gap-3 text-sm mt-3">
          <div><p class="text-xs font-medium text-muted mb-1">Financial impact</p>{{r.financialImpact}}<span v-if="r.potentialMonthly" class="block mt-1 font-medium">Potential: {{money(r.potentialMonthly)}}/mo</span></div>
          <div><p class="text-xs font-medium text-muted mb-1">If you ignore this</p>{{r.ifIgnored}}</div>
         </div>
         <div class="flex flex-wrap gap-1.5 mt-3">
          <UButton size="xs" :loading="busy===r.key+'HELPFUL'" @click="feedback(r.key,'HELPFUL')">Helpful</UButton>
          <UButton size="xs" color="neutral" variant="outline" :loading="busy===r.key+'ACKNOWLEDGED'" @click="feedback(r.key,'ACKNOWLEDGED')">Got it</UButton>
          <UButton size="xs" color="neutral" variant="ghost" :loading="busy===r.key+'NOT_RELEVANT'" @click="feedback(r.key,'NOT_RELEVANT')">Not relevant</UButton>
          <UButton size="xs" color="neutral" variant="ghost" :loading="busy===r.key+'DISMISSED'" @click="feedback(r.key,'DISMISSED')">Dismiss</UButton>
         </div>
        </div>
       </div>
      </li>
      <li v-if="!data.recommendations.length" class="px-5 py-10 text-center text-sm text-muted">Nothing urgent. Add activities or report usage on your subscriptions and advice will appear here, ranked.</li>
     </ol>
    </section>
    <div class="lg:col-span-2 space-y-6">
     <section><SpendChart :renewals="data.renewals" :categories="data.categoryTotals" :budget="data.totals.budget" :monthly="data.totals.monthly"/></section>
     <section class="border-t border-default pt-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
       <p class="text-sm"><span class="font-semibold">Google Calendar</span> <UBadge v-if="calStatus?.connected" color="success" variant="subtle" size="sm" class="ms-1">Connected</UBadge><span v-else class="text-muted"> — not connected</span></p>
       <UButton v-if="!calStatus?.connected" size="sm" icon="i-lucide-calendar-plus" to="/api/auth/google?calendar=1" external>Connect Calendar</UButton>
       <UButton v-else size="sm" color="neutral" variant="outline" icon="i-lucide-refresh-cw" @click="syncCal">Sync now</UButton>
      </div>
      <MiniCalendar :events="calEvents" :selected="selectedDay" @select-day="selectedDay=$event"/>
      <div v-if="selectedDay" class="mt-4 border-t border-default pt-3">
       <p class="text-xs font-medium text-muted">{{new Date(selectedDay).toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short'})}}</p>
       <p v-for="(e,i) in dayEvents" :key="i" class="text-sm mt-1.5">{{e.title}}</p>
       <p v-if="!dayEvents.length" class="text-sm text-muted mt-1.5">Nothing scheduled.</p>
      </div>
     </section>
     <section class="border-t border-default pt-2">
      <header class="py-3 flex justify-between items-center"><h2 class="font-semibold">Coming up</h2><UButton size="xs" variant="link" to="/portal/timeline">Full timeline</UButton></header>
      <ol class="relative ms-5 border-s border-default my-2">
       <li v-for="(e,i) in upcoming" :key="i" class="ms-5 py-2.5 pe-4 relative">
        <span class="absolute -start-[1.4rem] top-4 size-2.5 rounded-full ring-4 ring-[var(--ui-bg)]" :class="e.type==='RENEWAL'?'bg-primary':e.type==='ACTIVITY'?'bg-amber-500':'bg-sky-500'"/>
        <p class="text-sm font-medium leading-tight">{{e.title}}</p>
        <p class="text-xs text-muted mt-0.5">{{date(e.date)}}{{e.end&&e.end!==e.date?' → '+date(e.end):''}} · {{e.type.toLowerCase()}}</p>
       </li>
       <li v-if="!upcoming.length" class="ms-5 py-4 text-sm text-muted">Nothing coming up. Add an activity in Timeline.</li>
      </ol>
     </section>
    </div>
   </div>
   <p class="text-xs text-dimmed">*Potential = estimate, not saved money.</p>
  </template>
 </div>
</template>
