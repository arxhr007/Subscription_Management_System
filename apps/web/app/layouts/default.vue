<script setup lang="ts">
const { user, logout } = useAuth()
const toast = useToast()
const route=useRoute()
const colorMode=useColorMode()
const sidebarOpen=ref(false)
watch(()=>route.path,()=>{sidebarOpen.value=false})
const titles:Record<string,string>={'/portal':'Advisor','/portal/plan':'Plan','/portal/recommendations':'Recommendations','/portal/timeline':'Timeline','/portal/subscriptions':'Subscriptions','/portal/preferences':'Preferences','/portal/onboarding':'Welcome'}
const title=computed(()=>titles[route.path]||'Advisor')
const items=[[
 {label:'Advisor',icon:'i-lucide-sparkles',to:'/portal',exact:true},
 {label:'Recommendations',icon:'i-lucide-lightbulb',to:'/portal/recommendations'},
 {label:'Plan',icon:'i-lucide-list-checks',to:'/portal/plan'},
 {label:'Timeline',icon:'i-lucide-calendar-range',to:'/portal/timeline'},
 {label:'Subscriptions',icon:'i-lucide-repeat',to:'/portal/subscriptions'},
 {label:'Preferences',icon:'i-lucide-settings-2',to:'/portal/preferences'}
]]
const searchGroups=computed(()=>[{id:'navigation',label:'Go to',items:items.flat()}])
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
      <template #header><UDashboardNavbar :title="title" :ui="{right:'gap-3'}"><template #leading><UDashboardSidebarCollapse /></template><template #right><UColorModeButton /></template></UDashboardNavbar></template>
      <template #body><slot /></template>
    </UDashboardPanel>
  </UDashboardGroup>
</template>
