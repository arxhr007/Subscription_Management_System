<script setup lang="ts">
const {data,error,refresh}=await useFetch<any>('/api/advisor/overview')
const planned=computed(()=>(data.value?.subscriptions||[]).filter((s:any)=>s.status==='PLANNED'||s.status==='INTERESTED'))
</script>
<template>
 <div class="page space-y-6">
  <div><h1 class="text-2xl font-semibold tracking-tight">Spending</h1><p class="text-sm text-muted mt-2">Only active services count as spending. Planned and interested services are shown separately — they cost nothing yet.</p></div>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"><template #actions><UButton @click="refresh()">Retry</UButton></template></UAlert>
  <template v-if="data">
   <div class="grid sm:grid-cols-3 gap-px rounded-lg border border-default bg-default overflow-hidden">
    <div class="p-5 bg-elevated/25"><p class="text-xs text-muted">Monthly (active)</p><p class="text-2xl font-semibold mt-2 tabular-nums">{{money(data.totals.monthly)}}</p></div>
    <div class="p-5 bg-elevated/25"><p class="text-xs text-muted">Yearly estimate</p><p class="text-2xl font-semibold mt-2 tabular-nums">{{money(data.totals.yearly)}}</p></div>
    <div class="p-5 bg-elevated/25"><p class="text-xs text-muted">Budget</p><p class="text-2xl font-semibold mt-2 tabular-nums">{{data.totals.budget==null?'Not set':money(data.totals.budget)}}</p><p class="text-xs mt-1" :class="data.totals.budgetRemaining<0?'text-error':'text-dimmed'">{{data.totals.budget==null?'Set in Preferences':data.totals.budgetRemaining<0?money(-data.totals.budgetRemaining)+' over':money(data.totals.budgetRemaining)+' remaining'}}</p></div>
   </div>
   <section><SpendChart :renewals="data.renewals" :categories="data.categoryTotals" :budget="data.totals.budget" :monthly="data.totals.monthly"/></section>
   <section><h2 class="text-lg font-semibold mb-3">By category</h2><div class="divide-y divide-default border-y border-default"><div v-for="c in data.categoryTotals" :key="c.category" class="flex justify-between px-5 py-3 text-sm"><span>{{c.category}}</span><span class="font-medium tabular-nums">{{money(c.amount)}}/mo</span></div><p v-if="!data.categoryTotals.length" class="px-5 py-8 text-sm text-muted">No active spending yet.</p></div></section>
   <section><h2 class="text-lg font-semibold mb-3">Upcoming renewals (12 months)</h2><div class="divide-y divide-default border-y border-default"><div v-for="r in data.renewals.slice(0,24)" :key="r.id" class="flex justify-between px-5 py-3 text-sm"><span>{{r.title}}</span><span class="text-muted">{{date(r.date)}} · <span class="text-highlighted font-medium">{{money(r.amount)}}</span></span></div><p v-if="!data.renewals.length" class="px-5 py-8 text-sm text-muted">No renewals projected.</p></div></section>
   <section><h2 class="text-lg font-semibold mb-3">Planned commitments (not spending yet)</h2><div class="divide-y divide-default border-y border-default"><div v-for="s in planned" :key="s.id" class="flex justify-between px-5 py-3 text-sm"><span>{{s.name}} <UBadge variant="subtle" color="neutral" class="ms-2">{{s.status}}</UBadge></span><span class="text-muted">would be {{money(s.amount)}}/{{s.interval.toLowerCase()}}</span></div><p v-if="!planned.length" class="px-5 py-8 text-sm text-muted">Nothing planned. Add intentions from Plans.</p></div></section>
   <p class="text-xs text-dimmed">Potential savings on the Advisor page are estimates only. No savings are claimed here.</p>
  </template>
 </div>
</template>
