<script setup lang="ts">
const api=useApi(),toast=useToast()
interface Rec{key:string;action:string;title:string;reason:string;activity:string|null;financialImpact:string;potentialMonthly:number;ifIgnored:string;subscriptionId:string;date:string|null;priority:number}
const {data,refresh,error,status}=useFetch<any>('/api/advisor/overview')
const busy=ref(''),filter=ref('ALL')
async function restore(){busy.value='restore';try{await api('/advisor/feedback/restore',{method:'POST'});filter.value='ALL';await refresh();toast.add({title:'Dismissed recommendations restored',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=''}}
const labels:Record<string,string>={KEEP:'Keep',RECONSIDER:'Review',SUBSCRIBE:'Consider starting',DELAY:'Delay',OVERLAP:'Compare'}
const colors:Record<string,string>={KEEP:'success',RECONSIDER:'warning',SUBSCRIBE:'primary',DELAY:'neutral',OVERLAP:'warning'}
const dot:Record<string,string>={KEEP:'bg-emerald-500',RECONSIDER:'bg-amber-500',SUBSCRIBE:'bg-primary',DELAY:'bg-zinc-400',OVERLAP:'bg-orange-500'}
async function feedback(key:string,action:string){busy.value=key+action;try{await api('/advisor/feedback',{method:'POST',body:{recommendationKey:key,action}});await refresh();toast.add({title:'Done',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=''}}
const sorted=computed<Rec[]>(()=>[...(data.value?.recommendations||[])].sort((a,b)=>{
 const da=a.date?+new Date(a.date):Date.now(),db=b.date?+new Date(b.date):Date.now();return da-db||b.priority-a.priority}))
const groups=computed(()=>{
 const map=new Map<string,Rec[]>()
 for(const r of sorted.value.filter(r=>filter.value==='ALL'||r.action===filter.value)){const d=r.date?new Date(r.date):new Date();const label=d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});map.set(label,[...(map.get(label)||[]),r])}
 return [...map.entries()].map(([label,items])=>({label,items}))
})
const when=(r:Rec)=>{if(!r.date)return 'Now';const days=Math.ceil((+new Date(r.date)-Date.now())/86400000);return days<0?'Now':days===0?'Today':days===1?'Tomorrow':`In ${days}d`}
</script>
<template>
 <div class="page space-y-8">
  <div class="flex flex-wrap items-end justify-between gap-3">
   <div><p class="eyebrow">Decisions, explained</p><h1>Your next best moves.</h1><p class="text-sm text-muted mt-3">Prioritized advice, with the reasoning and tradeoffs up front.</p></div>
   <div class="flex flex-wrap items-center gap-3"><p class="text-sm text-muted">{{sorted.length}} actions · by date</p><UButton size="sm" color="neutral" variant="outline" :loading="busy==='restore'" @click="restore">Restore dismissed advice</UButton></div>
  </div>
  <nav class="filter-bar" aria-label="Recommendation filters"><UButton v-for="(label,key) in {ALL:'All decisions',...labels}" :key="key" :color="filter===key?'primary':'neutral'" :variant="filter===key?'solid':'ghost'" @click="filter=String(key)">{{label}}</UButton></nav>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"><template #actions><UButton @click="refresh()">Try again</UButton></template></UAlert>
  <USkeleton v-if="status==='pending'" class="h-64 w-full"/>
  <section v-if="data&&sorted.length&&!groups.length" class="empty-state"><h2 class="font-semibold">No decisions in this category.</h2><p class="text-sm text-muted mt-2">Try another filter to see your other recommendations.</p><UButton class="mt-4" color="neutral" variant="outline" @click="filter='ALL'">Show all decisions</UButton></section>
  <template v-if="data">
   <section v-if="!sorted.length" class="empty-state"><h2 class="font-semibold">No current recommendations</h2><p class="text-sm text-muted mt-2">Add subscriptions, update usage or plan an activity to get advice. Dismissed advice stays hidden.</p><div class="flex justify-center flex-wrap gap-2 mt-4"><UButton to="/portal/subscriptions">Manage subscriptions</UButton><UButton to="/portal/timeline" color="neutral" variant="outline">Open calendar</UButton></div></section>
   <section v-for="g in groups" :key="g.label">
    <div class="flex items-center gap-3 mb-2"><h2 class="font-semibold">{{g.label}}</h2><span class="flex-1 border-t border-default"/></div>
    <ol class="relative ms-3 border-s-2 border-default">
     <li v-for="r in g.items" :key="r.key" class="ms-6 pb-6 relative">
      <span class="absolute -start-[2.1rem] top-1 size-3.5 rounded-full ring-4 ring-[var(--ui-bg)]" :class="dot[r.action]"/>
      <div class="flex flex-wrap items-center gap-2">
       <UBadge :color="colors[r.action] as any" variant="subtle" size="sm">{{labels[r.action]}}</UBadge>
       <UBadge v-if="r.priority>=85" color="error" variant="subtle" size="sm">Urgent</UBadge>
       <span class="text-xs font-medium text-muted">{{when(r)}}<span v-if="r.date"> · {{date(r.date)}}</span></span>
       <span v-if="r.potentialMonthly" class="text-xs font-medium text-primary">Potential {{money(r.potentialMonthly)}}/mo</span>
      </div>
      <p class="font-medium mt-1.5">{{r.title}}</p>
      <p class="text-sm text-muted mt-0.5">{{r.reason}}</p>
      <div class="decision-impact mt-4"><p class="eyebrow">Financial impact</p><p class="text-sm">{{r.financialImpact}}</p></div><details class="text-sm mt-3"><summary class="cursor-pointer font-medium">If you leave things as they are</summary><p class="text-muted mt-2">{{r.ifIgnored}}</p></details>
      <div class="flex flex-wrap gap-1.5 mt-2.5">
       <UButton size="xs" :loading="busy===r.key+'HELPFUL'" @click="feedback(r.key,'HELPFUL')">Helpful</UButton>
       <UButton size="xs" color="neutral" variant="outline" :loading="busy===r.key+'ACKNOWLEDGED'" @click="feedback(r.key,'ACKNOWLEDGED')">Got it</UButton>
       <UButton size="xs" color="neutral" variant="ghost" :loading="busy===r.key+'NOT_RELEVANT'" @click="feedback(r.key,'NOT_RELEVANT')">Not relevant</UButton>
       <UButton size="xs" color="neutral" variant="ghost" :loading="busy===r.key+'DISMISSED'" @click="feedback(r.key,'DISMISSED')">Dismiss</UButton>
      </div>
     </li>
    </ol>
   </section>
   <p v-if="sorted.some(r=>r.potentialMonthly)" class="text-xs text-dimmed">Potential savings are estimates. Changes happen only when you act with your provider.</p>
  </template>
 </div>
</template>
