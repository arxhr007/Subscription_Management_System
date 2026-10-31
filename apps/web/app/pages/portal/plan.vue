<script setup lang="ts">
const {data,error,refresh}=useFetch<any>('/api/advisor/plan')
const showJson=ref(false)
const recColor:Record<string,string>={keep:'success',review:'warning',subscribe:'primary',delay:'neutral',rotate:'warning',evaluate:'neutral'}
const inr=(v:number|null)=>v==null?'—':'₹'+v.toLocaleString('en-IN')
</script>
<template>
 <div class="page space-y-8">
  <div class="flex flex-wrap justify-between items-center gap-3">
   <div><p class="eyebrow">Look ahead</p><h1>A plan that fits your life.</h1><p class="text-sm text-muted mt-3">Your commitments and upcoming decisions for the next three months.</p></div>
   <div class="flex gap-2"><UButton size="sm" color="neutral" variant="outline" icon="i-lucide-code" @click="showJson=!showJson">{{showJson?'Hide JSON':'View JSON'}}</UButton><UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" @click="refresh()">Refresh</UButton></div>
  </div>
  <UAlert v-if="error" color="error" :title="errorMessage(error)"/>
  <template v-if="data">
   <section>
    <div class="flex flex-wrap gap-x-8 gap-y-2 text-sm border-y border-default py-3">
     <span><span class="text-muted">Occupation</span> · <strong class="capitalize">{{data.profile.occupation}}</strong></span>
     <span><span class="text-muted">Budget target</span> · <strong>{{inr(data.profile.monthly_budget.target)}}/mo</strong></span>
     <span><span class="text-muted">Active now</span> · <strong>{{inr(data.financial_settings.current_active_monthly)}}/mo</strong></span>
     <span><span class="text-muted">Potential</span> · <strong>{{inr(data.financial_settings.potential_monthly_savings)}}/mo</strong></span>
     <span><span class="text-muted">Period</span> · <strong>{{data.profile.planning_period.start}} → {{data.profile.planning_period.end}}</strong></span>
     <span><span class="text-muted">Auto buy/cancel</span> · <strong>Never</strong></span>
    </div>
   </section>
   <section>
    <h2 class="font-semibold mb-3">Subscriptions</h2>
    <div class="overflow-x-auto"><table class="w-full text-sm">
     <thead><tr class="text-left text-muted border-b border-default"><th class="py-2.5 pe-4 font-medium">Service</th><th class="py-2.5 pe-4 font-medium">Status</th><th class="py-2.5 pe-4 font-medium hidden sm:table-cell">Price</th><th class="py-2.5 pe-4 font-medium hidden md:table-cell">Renewal</th><th class="py-2.5 pe-4 font-medium hidden md:table-cell">Priority</th><th class="py-2.5 pe-4 font-medium">Verdict</th><th class="py-2.5 font-medium hidden lg:table-cell">Why</th></tr></thead>
     <tbody class="divide-y divide-default">
      <tr v-for="s in data.subscriptions" :key="s.name" class="hover:bg-elevated/40">
       <td class="py-3 pe-4 font-medium">{{s.name}}<span class="block text-xs text-muted font-normal capitalize">{{s.category.replaceAll('_',' ')}} · {{s.billing_cycle}}</span></td>
       <td class="py-3 pe-4 capitalize">{{s.status}}</td>
       <td class="py-3 pe-4 hidden sm:table-cell tabular-nums">{{s.price==null?'unknown':inr(s.price)}}</td>
       <td class="py-3 pe-4 hidden md:table-cell">{{s.renewal_date||'—'}}</td>
       <td class="py-3 pe-4 hidden md:table-cell capitalize">{{s.priority}}</td>
       <td class="py-3 pe-4"><UBadge :color="recColor[s.recommendation] as any" variant="subtle" class="capitalize">{{s.recommendation}}</UBadge><span v-if="s.review_date" class="block text-xs text-muted mt-1">{{s.review_date}}</span></td>
       <td class="py-3 pe-4 hidden lg:table-cell text-muted max-w-72">{{s.reason||'—'}}<span v-for="a in s.actions.slice(1)" :key="a" class="block mt-0.5">{{a}}</span></td>
      </tr>
     </tbody></table>
     <p v-if="!data.subscriptions.length" class="py-10 text-center text-sm text-muted">No subscriptions yet.</p></div>
   </section>
   <section>
    <h2 class="font-semibold mb-3">Timeline</h2>
    <ol class="relative ms-3 border-s-2 border-default">
     <li v-for="p in data.timeline" :key="p.period" class="ms-6 pb-6 relative">
      <span class="absolute -start-[2.05rem] top-1 size-3 rounded-full bg-primary ring-4 ring-[var(--ui-bg)]"/>
      <p class="text-sm font-medium">{{p.activity}} <span class="text-muted font-normal">· {{p.theme.replaceAll('_',' ')}}</span></p>
      <p class="text-xs text-muted mt-0.5">{{p.period.replace('_to_',' → ')}}</p>
      <ul class="mt-2 space-y-1 text-sm"><li v-for="(a,i) in p.actions" :key="i" class="flex flex-wrap gap-x-3"><span class="text-muted tabular-nums">{{a.date}}</span><span>{{a.service}}</span><UBadge size="xs" variant="subtle" color="neutral" class="capitalize">{{a.action.replaceAll('_',' ')}}</UBadge><span class="text-xs text-muted capitalize">{{a.priority}}</span></li></ul>
     </li>
     <li v-if="!data.timeline.length" class="ms-6 py-4 text-sm text-muted">No activities in the next 3 months. Add exams, trips or projects in Timeline.</li>
    </ol>
   </section>
   <section>
    <h2 class="font-semibold mb-3">Rules in effect</h2>
    <ul class="divide-y divide-default border-y border-default text-sm">
     <li v-for="r in data.optimization_rules" :key="r.id" class="py-3 grid sm:grid-cols-[14rem_1fr_1fr] gap-1 sm:gap-4"><span class="font-mono text-xs pt-0.5">{{r.id}}</span><span class="text-muted">{{r.condition}}</span><span>{{r.action}}</span></li>
    </ul>
   </section>
   <section v-if="showJson">
    <h2 class="font-semibold mb-3">JSON</h2>
    <pre class="text-xs leading-5 overflow-x-auto rounded-lg bg-elevated/60 p-4 max-h-[32rem] overflow-y-auto">{{JSON.stringify(data,null,2)}}</pre>
    <p class="text-xs text-muted mt-2">Live endpoint: <code>GET /api/advisor/plan</code></p>
   </section>
  </template>
 </div>
</template>
