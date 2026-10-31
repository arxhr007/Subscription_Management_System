<script setup lang="ts">
export interface CalEvent{date:string;end?:string;title:string;type:'RENEWAL'|'ACTIVITY'|'INTENTION'}
const props=defineProps<{events:CalEvent[];selected?:string}>()
const emit=defineEmits<{'select-day':[string]}>()
const cursor=ref(new Date());cursor.value.setDate(1)
const todayKey=new Date().toDateString()
const cells=computed(()=>{
 const y=cursor.value.getFullYear(),m=cursor.value.getMonth(),first=new Date(y,m,1),startDay=first.getDay(),days=new Date(y,m+1,0).getDate()
 const out:({key:string;day:number;date:Date;inMonth:boolean})[]=[]
 for(let i=0;i<startDay;i++){const d=new Date(y,m,i-startDay+1);out.push({key:d.toISOString(),day:d.getDate(),date:d,inMonth:false})}
 for(let d=1;d<=days;d++){const dt=new Date(y,m,d);out.push({key:dt.toISOString(),day:d,date:dt,inMonth:true})}
 while(out.length%7) {const d=new Date(y,m,days+(out.length%7)+1);out.push({key:d.toISOString()+Math.random(),day:d.getDate(),date:d,inMonth:false})}
 return out
})
const byDay=computed(()=>{const map=new Map<string,CalEvent[]>();for(const e of props.events){const k=new Date(e.date).toDateString();map.set(k,[...(map.get(k)||[]),e])}return map})
const monthLabel=computed(()=>cursor.value.toLocaleDateString('en-IN',{month:'long',year:'numeric'}))
function move(n:number){const d=new Date(cursor.value);d.setMonth(d.getMonth()+n);cursor.value=d}
const dotColor=(t:string)=>t==='RENEWAL'?'bg-primary':t==='ACTIVITY'?'bg-amber-500':'bg-sky-500'
</script>
<template>
 <div>
  <div class="flex items-center justify-between mb-3">
   <p class="text-sm font-semibold">{{monthLabel}}</p>
   <div class="flex gap-1"><UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-left" aria-label="Previous month" @click="move(-1)"/><UButton size="xs" color="neutral" variant="ghost" @click="cursor=new Date();cursor.setDate(1)">Today</UButton><UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-chevron-right" aria-label="Next month" @click="move(1)"/></div>
  </div>
  <div class="grid grid-cols-7 text-center text-[11px] text-dimmed mb-1"><span v-for="d in ['Su','Mo','Tu','We','Th','Fr','Sa']" :key="d">{{d}}</span></div>
  <div class="grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-default bg-default">
   <button v-for="c in cells" :key="c.key" class="min-h-14 p-1 text-left align-top bg-[var(--ui-bg)] hover:bg-elevated/60 focus-visible:outline-primary" :class="[!c.inMonth&&'opacity-35',c.date.toDateString()===todayKey&&'ring-1 ring-inset ring-primary',selected===c.date.toDateString()&&'bg-elevated']" @click="emit('select-day',c.date.toDateString())">
    <span class="text-xs font-medium">{{c.day}}</span>
    <span class="flex gap-0.5 mt-1 flex-wrap"><span v-for="(e,i) in (byDay.get(c.date.toDateString())||[]).slice(0,4)" :key="i" class="size-1.5 rounded-full" :class="dotColor(e.type)" :title="e.title"/></span>
    <span v-if="(byDay.get(c.date.toDateString())||[]).length" class="block text-[10px] leading-tight truncate mt-0.5 hidden lg:block">{{byDay.get(c.date.toDateString())![0]!.title}}</span>
   </button>
  </div>
  <div class="flex gap-4 mt-2 text-[11px] text-muted"><span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-primary"/>Renewal</span><span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-amber-500"/>Activity</span><span class="flex items-center gap-1"><span class="size-1.5 rounded-full bg-sky-500"/>Planned start</span></div>
 </div>
</template>
