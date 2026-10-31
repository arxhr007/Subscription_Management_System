<script setup lang="ts">
const props=defineProps<{renewals:{date:string;amount:number;title:string}[];categories:{category:string;amount:number}[];budget:number|null;monthly:number}>()
// Projected cash-out per month for next 6 months, from real renewal dates — not a smoothed guess
const months=computed(()=>{
 const out:{label:string;total:number;count:number}[]=[],now=new Date()
 for(let i=0;i<6;i++){const d=new Date(now.getFullYear(),now.getMonth()+i,1),key=`${d.getFullYear()}-${d.getMonth()}`
  const rs=props.renewals.filter(r=>{const rd=new Date(r.date);return `${rd.getFullYear()}-${rd.getMonth()}`===key})
  out.push({label:d.toLocaleDateString('en-IN',{month:'short'}),total:rs.reduce((s,r)=>s+r.amount,0),count:rs.length})}
 return out
})
const maxMonth=computed(()=>Math.max(1,...months.value.map(m=>m.total)))
const maxCat=computed(()=>Math.max(1,...props.categories.map(c=>c.amount)))
const budgetPct=computed(()=>props.budget?Math.min(100,Math.round(props.monthly/props.budget*100)):null)
</script>
<template>
 <div class="space-y-6">
  <div>
   <div class="flex items-baseline justify-between"><p class="text-sm font-semibold">Projected spend — next 6 months</p><p class="text-xs text-muted">from your renewal dates</p></div>
   <div class="flex items-end gap-2 h-36 mt-4" role="img" :aria-label="`Projected monthly spend: ${months.map(m=>`${m.label} ${money(m.total)}`).join(', ')}`">
    <div v-for="m in months" :key="m.label" class="flex-1 flex flex-col items-center justify-end h-full gap-1 min-w-0">
     <span class="text-[11px] font-medium tabular-nums truncate">{{m.total?money(m.total):'—'}}</span>
     <div class="w-full max-w-10 bg-primary/85 hover:bg-primary transition-colors" :style="{height:`${Math.max(m.total?6:2,(m.total/maxMonth)*100)}%`}" :title="`${m.label}: ${money(m.total)} across ${m.count} renewal(s)`"/>
     <span class="text-[11px] text-muted">{{m.label}}</span>
    </div>
   </div>
  </div>
  <div v-if="budgetPct!==null">
   <div class="flex justify-between text-sm"><span class="font-medium">Budget use</span><span class="tabular-nums" :class="budgetPct>100?'text-error font-semibold':''">{{money(monthly)}} of {{money(budget!)}} · {{budgetPct}}%</span></div>
   <div class="h-2 rounded-full bg-elevated mt-2 overflow-hidden"><div class="h-full" :class="budgetPct>100?'bg-error':'bg-primary'" :style="{width:`${budgetPct}%`}"/></div>
  </div>
  <div>
   <p class="text-sm font-semibold mb-3">Where it goes <span class="text-muted font-normal">/ month</span></p>
   <div class="space-y-2.5">
    <div v-for="c in categories" :key="c.category" class="grid grid-cols-[7rem_1fr_5rem] items-center gap-3 text-sm">
     <span class="truncate">{{c.category}}</span>
     <div class="h-2.5 bg-elevated rounded-full overflow-hidden"><div class="h-full bg-primary/80" :style="{width:`${(c.amount/maxCat)*100}%`}"/></div>
     <span class="text-right tabular-nums font-medium">{{money(c.amount)}}</span>
    </div>
    <p v-if="!categories.length" class="text-sm text-muted">No active spending yet.</p>
   </div>
  </div>
 </div>
</template>
