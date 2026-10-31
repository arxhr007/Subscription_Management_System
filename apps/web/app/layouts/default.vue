<script setup lang="ts">
const { user, logout } = useAuth()
const toast = useToast()
const route=useRoute()
const colorMode=useColorMode()
const sidebarOpen=ref(false)
watch(()=>route.path,()=>{sidebarOpen.value=false})
const titles:Record<string,string>={'/portal':'Advisor','/portal/plan':'Plan','/portal/recommendations':'Recommendations','/portal/timeline':'Calendar','/portal/calendar':'Calendar','/portal/subscriptions':'Subscriptions','/portal/preferences':'Preferences','/portal/onboarding':'Welcome','/':'Overview','/portal/billing':'My billing'}
const title=computed(()=>titles[route.path]||route.path.split('/').filter(Boolean).at(-1)?.replace(/-/g,' ')||'Advisor')
const staff=computed(()=>user.value&&user.value.role!=='CUSTOMER')
const months=useState('reporting-months',()=>6),planId=useState('reporting-plan',()=>'')
const simulation=useState('billing-simulation',()=>false)
const {data:bizPlans,execute:loadPlans}=useFetch<{items:{id:string;name:string}[]}>('/api/plans',{immediate:false})
watch(staff,value=>{if(value)void loadPlans()},{immediate:true})
const items=computed(()=>{
 const personal=[{label:'Personal advisor',type:'label' as const},
  {label:'Advisor',icon:'i-lucide-sparkles',to:'/portal',exact:true},
  {label:'Recommendations',icon:'i-lucide-lightbulb',to:'/portal/recommendations'},
  {label:'Plan',icon:'i-lucide-list-checks',to:'/portal/plan'},
  {label:'Calendar',icon:'i-lucide-calendar-range',to:'/portal/calendar'},
  {label:'Subscriptions',icon:'i-lucide-repeat',to:'/portal/subscriptions'},
  ...(user.value?.customerId?[{label:'My billing',icon:'i-lucide-receipt',to:'/portal/billing'}]:[]),
  {label:'Preferences',icon:'i-lucide-settings-2',to:'/portal/preferences'}]
 if(!staff.value)return [personal]
 return [personal,[{label:'Brightloop business',type:'label' as const},
  {label:'Overview',icon:'i-lucide-layout-dashboard',to:'/',exact:true},
  {label:'Subscriptions',icon:'i-lucide-repeat',to:'/subscriptions'},
  {label:'Renewals',icon:'i-lucide-calendar-clock',to:'/renewals'},
  {label:'Customers',icon:'i-lucide-users',to:'/customers'},
  {label:'Quotation templates',icon:'i-lucide-files',to:'/templates'},
  {label:'Invoices',icon:'i-lucide-file-text',to:'/invoices'},
  {label:'Payments',icon:'i-lucide-credit-card',to:'/payments'},
  {label:'Reconciliation',icon:'i-lucide-git-compare-arrows',to:'/reconcile'}],
  [{label:'Configuration',type:'label' as const},
  {label:'Products',icon:'i-lucide-package',to:'/products'},
  {label:'Plans',icon:'i-lucide-layers',to:'/plans'},
  {label:'Taxes',icon:'i-lucide-percent',to:'/taxes'},
  {label:'Discounts',icon:'i-lucide-tag',to:'/discounts'},
  {label:'Import',icon:'i-lucide-upload',to:'/import'},
  ...(user.value?.role==='ADMIN'?[{label:'Team',icon:'i-lucide-user-cog',to:'/team'}]:[])]]
})
const searchGroups=computed(()=>[{id:'navigation',label:'Go to',items:items.value.flat().filter(i=>'to' in i)}])
const userItems=computed(()=>[[{type:'label' as const,label:user.value?.name||'Account'}],[{label:'Light mode',icon:'i-lucide-sun',onSelect:()=>{colorMode.preference='light'}},{label:'Dark mode',icon:'i-lucide-moon',onSelect:()=>{colorMode.preference='dark'}}],[{label:'Sign out',icon:'i-lucide-log-out',onSelect:()=>signOut()}]])
async function signOut() { try { await logout() } catch(e) { toast.add({ title: errorMessage(e), color: 'error' }) } }
</script>
<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar id="default" v-model:open="sidebarOpen" collapsible resizable class="bg-elevated/25" :ui="{footer:'lg:border-t lg:border-default'}">
      <template #header="{collapsed}"><UDropdownMenu :items="[[{label:'Subscription Advisor',icon:'i-lucide-orbit',to:'/portal'}]]" :content="{align:'center'}" :ui="{content:'w-56'}"><UButton :label="collapsed?undefined:'Advisor'" icon="i-lucide-orbit" :trailing-icon="collapsed?undefined:'i-lucide-chevrons-up-down'" color="neutral" variant="ghost" block :square="collapsed" class="py-2 data-[state=open]:bg-elevated" :ui="{trailingIcon:'text-dimmed'}"/></UDropdownMenu></template>
      <template #default="{collapsed}"><UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default"/><UNavigationMenu :items="items" orientation="vertical" :collapsed="collapsed" tooltip popover/></template>
      <template #footer="{collapsed}"><UDropdownMenu :items="userItems" :content="{align:'center',collisionPadding:12}" :ui="{content:collapsed?'w-48':'w-(--reka-dropdown-menu-trigger-width)'}"><UButton :label="collapsed?undefined:user?.name" :avatar="{alt:user?.name}" :trailing-icon="collapsed?undefined:'i-lucide-chevrons-up-down'" color="neutral" variant="ghost" block :square="collapsed" class="data-[state=open]:bg-elevated" :ui="{trailingIcon:'text-dimmed'}"/></UDropdownMenu></template>
    </UDashboardSidebar>
    <UDashboardSearch :groups="searchGroups"/>
    <UDashboardPanel id="workspace">
      <template #header><UDashboardNavbar :title="title" :ui="{right:'gap-3'}"><template #leading><UDashboardSidebarCollapse /></template><template #right><AskFinance v-if="staff"/><UColorModeButton /></template></UDashboardNavbar><UDashboardToolbar v-if="route.path==='/'&&staff"><template #left><USelect v-model="months" icon="i-lucide-calendar" :items="[{label:'Last 3 months',value:3},{label:'Last 6 months',value:6},{label:'Last 12 months',value:12}]" color="neutral" variant="ghost" aria-label="Reporting period" class="-ms-1"/><USelect v-model="planId" :items="[{label:'All plans',value:''},...(bizPlans?.items||[]).map(p=>({label:p.name,value:p.id}))]" variant="ghost" aria-label="Plan filter"/></template><template #right><UButton v-if="user?.role==='ADMIN'" icon="i-lucide-fast-forward" color="neutral" variant="ghost" size="sm" @click="simulation=true">Rehearse month</UButton><UButton to="/subscriptions/new" icon="i-lucide-plus" size="sm">New subscription</UButton></template></UDashboardToolbar></template>
      <template #body><slot /></template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
