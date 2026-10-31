<script setup lang="ts">
const api=useApi(),toast=useToast()
interface Rec{key:string;action:string;title:string;reason:string;activity:string|null;financialImpact:string;potentialMonthly:number;ifIgnored:string;subscriptionId:string;date:string|null;priority:number}
const {data,refresh,error}=await useFetch<any>('/api/advisor/overview')
const busy=ref('')
const labels:Record<string,string>={KEEP:'Keep',RECONSIDER:'Review',SUBSCRIBE:'Take it',DELAY:'Delay',OVERLAP:'Rotate'}
const colors:Record<string,string>={KEEP:'success',RECONSIDER:'warning',SUBSCRIBE:'primary',DELAY:'neutral',OVERLAP:'warning'}
const dot:Record<string,string>={KEEP:'bg-emerald-500',RECONSIDER:'bg-amber-500',SUBSCRIBE:'bg-primary',DELAY:'bg-zinc-400',OVERLAP:'bg-orange-500'}
async function feedback(key:string,action:string){busy.value=key+action;try{await api('/advisor/feedback',{method:'POST',body:{recommendationKey:key,action}});await refresh();toast.add({title:'Done',color:'success'})}catch(e){toast.add({title:errorMessage(e),color:'error'})}finally{busy.value=''}}
const sorted=computed<Rec[]>(()=>[...(data.value?.recommendations||[])].sort((a,b)=>{
 const da=a.date?+new Date(a.date):Date.now(),db=b.date?+new Date(b.date):Date.now();return da-db||b.priority-a.priority}))
const groups=computed(()=>{
 const map=new Map<string,Rec[]>()
 for(const r of sorted.value){const d=r.date?new Date(r.date):new Date();const label=d.toLocaleDateString('en-IN',{month:'long',year:'numeric'});map.set(label,[...(map.get(label)||[]),r])}
 return [...map.entries()].map(([label,items])=>({label,items}))
})
// Overlaps never share a season: one service per month, rotating
const usageRank:Record<string,number>={HIGH:3,MEDIUM:2,LOW:1,UNKNOWN:0}
const rotations=computed(()=>{
 const subs=data.value?.subscriptions||[]
 return (data.value?.recommendations||[]).filter((r:Rec)=>r.action==='OVERLAP').map((r:Rec)=>{
  const keep=subs.find((s:any)=>s.id===r.subscriptionId);if(!keep)return null
  const group=subs.filter((s:any)=>s.status==='ACTIVE'&&s.category===keep.category).sort((a:any,b:any)=>(b.importance-a.importance)||((usageRank[b.usage]||0)-(usageRank[a.usage]||0)))
  if(group.length<2)return null
  const months=Array.from({length:4},(_,i)=>{const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+i);const svc=group[i%group.length];return{label:d.toLocaleDateString('en-IN',{month:'short'}),service:svc.name,amount:svc.amount}})
  return{key:r.key,category:keep.category,months,paused:group.slice(1)}
 })
})
const when=(r:Rec)=>{if(!r.date)return 'Now';const days=Math.ceil((+new Date(r.date)-Date.now())/86400000);return days<0?'Now':days===0?'Today':days===1?'Tomorrow':`In ${days}d`}
</script>
<template>
 <div class="page space-y-8">
  <div class="flex flex-wrap items-end justify-between gap-3">
   <h1 class="text-2xl font-semibold tracking-tight">Recommendations</h1>
   <p class="text-sm text-muted">{{sorted.length}} actions · by date</p>
  </div>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"><template #actions><UButton @click="refresh()">Try again</UButton></template></UAlert>
  <template v-if="data">
   <section v-for="rot in rotations.filter(Boolean)" :key="rot!.key">
    <div class="flex items-center gap-2 mb-3"><UIcon name="i-lucide-repeat" class="text-orange-500"/><h2 class="font-semibold">{{rot!.category}} rotation — one at a time</h2></div>
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg border border-default bg-default overflow-hidden">
     <div v-for="(m,i) in rot!.months" :key="i" class="p-4 bg-elevated/25">
      <p class="text-xs text-muted">{{m.label}}</p>
      <p class="font-semibold mt-1.5 truncate">{{m.service}}</p>
      <p class="text-xs text-dimmed mt-0.5">{{m.amount?money(m.amount)+'/mo':'price unknown'}}</p>
      <UBadge v-if="i===0" size="xs" color="success" variant="subtle" class="mt-2">on now</UBadge><UBadge v-else size="xs" color="neutral" variant="subtle" class="mt-2">queued</UBadge>
     </div>
    </div>
    <p class="text-xs text-muted mt-2">Rest stay paused each month. Swap when the month flips — never two in the same season.</p>
   </section>
   <p v-if="!sorted.length" class="text-sm text-muted py-10 text-center">No recommendations. Add activities or subscriptions.</p>
   <section v-for="g in groups" :key="g.label">
    <div class="flex items-center gap-3 mb-2"><h2 class="font-semibold">{{g.label}}</h2><span class="flex-1 border-t border-default"/></div>
    <ol class="relative ms-3 border-s-2 border-default">
     <li v-for="r in g.items" :key="r.key" class="ms-6 pb-6 relative">
      <span class="absolute -start-[2.1rem] top-1 size-3.5 rounded-full ring-4 ring-[var(--ui-bg)]" :class="dot[r.action]"/>
      <div class="flex flex-wrap items-center gap-2">
       <UBadge :color="colors[r.action] as any" variant="subtle" size="sm">{{labels[r.action]}}</UBadge>
       <UBadge v-if="r.priority>=85" color="error" variant="subtle" size="sm">Urgent</UBadge>
       <span class="text-xs font-medium text-muted">{{when(r)}}<span v-if="r.date"> · {{date(r.date)}}</span></span>
       <span v-if="r.potentialMonthly" class="text-xs font-medium text-primary">save {{money(r.potentialMonthly)}}/mo*</span>
      </div>
      <p class="font-medium mt-1.5">{{r.title}}</p>
      <p class="text-sm text-muted mt-0.5">{{r.reason}}</p>
      <p class="text-xs text-dimmed mt-1">{{r.financialImpact}}</p>
      <div class="flex flex-wrap gap-1.5 mt-2.5">
       <UButton size="xs" :loading="busy===r.key+'HELPFUL'" @click="feedback(r.key,'HELPFUL')">Helpful</UButton>
       <UButton size="xs" color="neutral" variant="outline" :loading="busy===r.key+'ACKNOWLEDGED'" @click="feedback(r.key,'ACKNOWLEDGED')">Got it</UButton>
       <UButton size="xs" color="neutral" variant="ghost" :loading="busy===r.key+'NOT_RELEVANT'" @click="feedback(r.key,'NOT_RELEVANT')">Not relevant</UButton>
       <UButton size="xs" color="neutral" variant="ghost" :loading="busy===r.key+'DISMISSED'" @click="feedback(r.key,'DISMISSED')">Dismiss</UButton>
      </div>
     </li>
    </ol>
   </section>
   <p v-if="sorted.some(r=>r.potentialMonthly)" class="text-xs text-dimmed">*Potential only — counts when you actually change the plan.</p>
  </template>
 </div>
</template>
