<script setup lang="ts">
import { resources, labels, cellValue, type Row } from '~/utils/resources'
const route = useRoute(), { user } = useAuth(), toast = useToast()
const key = computed(() => String(route.params.resource))
const resource = computed(() => resources[key.value])
if (!resource.value) throw createError({ statusCode:404, statusMessage:'Page not found' })
const page = ref(1), q = ref(''), search = ref(''), filter = ref(String(route.query.status || ''))
let debounce: ReturnType<typeof setTimeout>
watch(search, value => { clearTimeout(debounce); debounce = setTimeout(() => { q.value = value; page.value = 1 }, 250) })
onUnmounted(() => clearTimeout(debounce))
watch(key, () => { page.value=1; search.value=''; q.value=''; filter.value='' })
const { data, status, error, refresh } = await useFetch<{ items: Row[]; total?: number }>(() => `/api/${resource.value!.endpoint}`, { query: { page, q, status:filter, pageSize:20 } })
const columns = computed(() => [...resource.value!.columns.map(accessorKey => ({ accessorKey, header: labels[accessorKey] || accessorKey.charAt(0).toUpperCase()+accessorKey.slice(1), cell: ({ row }: { row: { original: Row } }) => cellValue(accessorKey,row.original[accessorKey]) })), { id:'actions', header:'' }])
const visible = computed(() => resource.value?.paged || !q.value ? data.value?.items || [] : (data.value?.items || []).filter(r => JSON.stringify(r).toLowerCase().includes(q.value.toLowerCase())))
const canEdit = computed(() => !resource.value?.readonly && (!resource.value?.admin || user.value?.role === 'ADMIN'))
const open = ref(false), editing = ref(''), busy = ref(false), formError = ref(''), state = ref<Row>({})
const { data: products } = await useFetch<{ items:Row[] }>('/api/products')
function edit(row?:Row) {
 editing.value = row?.id || ''; state.value = structuredClone(resource.value!.defaults); formError.value=''
 if (row) {
  for (const field of resource.value!.fields) { let v=row[field.key]; if (['salesPrice','costPrice','price','minAmount'].includes(field.key) || (field.key==='value' && row.type==='FIXED')) v=v/100; if (field.type==='date') v=v?.slice(0,10) || ''; state.value[field.key]=v ?? '' }
  state.value.variants=(row.variants || []).map((v:Row)=>({...v,extraPrice:v.extraPrice/100}));state.value.productIds=(row.products||[]).map((p:Row)=>p.id);state.value.subscriptionIds=(row.subscriptions||[]).map((s:Row)=>s.id)
  if(key.value==='taxes' && !row.productType) state.value.productType='ALL'
 }
 open.value=true
}
async function save() {
 busy.value=true;formError.value=''
 try {
  const body=JSON.parse(JSON.stringify(state.value)); if(body.productType==='ALL') body.productType=null
  const checked=resource.value!.schema?.safeParse(body)
  if(checked && !checked.success) { formError.value=checked.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('\n'); return }
  await useApi()(`/${resource.value!.endpoint}${editing.value ? '/'+editing.value : ''}`,{method:editing.value?'PUT':'POST',body});open.value=false;await refresh();toast.add({title:'Saved successfully',color:'success'})
 } catch(e) { formError.value=errorMessage(e) } finally { busy.value=false }
}
function link(row:Row) { if(key.value==='subscriptions'||key.value==='renewals') return `/subscriptions/${row.id}`;if(key.value==='invoices') return `/invoices/${row.id}`;return undefined }
</script>
<template><div v-if="resource" class="page"><div class="page-head"><div><h1>{{resource.title}}</h1><p>{{resource.description}}</p></div><UButton v-if="canEdit && resource.fields.length" icon="i-lucide-plus" @click="edit()">Add {{key==='team'?'staff':key.slice(0,-1)}}</UButton><UButton v-else-if="key==='subscriptions' || key==='templates'" :to="`/${key}/new`" icon="i-lucide-plus">Create {{key==='templates'?'template':'subscription'}}</UButton></div>
<UCard><div class="flex flex-wrap gap-3 mb-5"><UInput v-model="search" icon="i-lucide-search" placeholder="Search records…" aria-label="Search records" class="w-full sm:w-72" /><USelect v-if="resource.statuses" v-model="filter" :items="[{label:'All statuses',value:''},...resource.statuses.map(s=>({label:s,value:s}))]" aria-label="Filter by status" @update:model-value="page=1" /><UButton variant="ghost" color="neutral" icon="i-lucide-refresh-cw" aria-label="Refresh" @click="refresh()" /></div><UAlert v-if="error" color="error" :title="errorMessage(error)" class="mb-4" /><UTable :data="visible" :columns="columns" :loading="status==='pending'" :empty="error ? 'Could not load records. Use refresh to retry.' : 'No records yet. Your next chapter starts here.'"><template #actions-cell="{row}"><UButton v-if="link(row.original)" :to="link(row.original)" variant="ghost" trailing-icon="i-lucide-arrow-up-right" size="xs">Open</UButton><UButton v-else-if="canEdit && resource.fields.length && key!=='team'" variant="ghost" size="xs" @click="edit(row.original)">Edit</UButton><UButton v-else-if="key==='templates'" :to="`/subscriptions/new?template=${row.original.id}`" variant="ghost" size="xs">Use template</UButton></template></UTable><div v-if="resource.paged && data" class="flex justify-between flex-wrap items-center gap-3 border-t border-default pt-4 mt-4"><p class="text-sm text-muted">{{data.total || 0}} records</p><UPagination v-model:page="page" :total="data.total||0" :items-per-page="20" /></div></UCard>
<UModal v-model:open="open" :title="`${editing?'Edit':'Add'} ${resource.title.toLowerCase()}`" :ui="{content:'sm:max-w-2xl'}"><template #body><form class="space-y-5" @submit.prevent="save"><UAlert v-if="formError" color="error" :title="formError" class="whitespace-pre-line" /><div class="form-grid"><UFormField v-for="field in resource.fields" :key="field.key" :label="field.label" :name="field.key"><USwitch v-if="field.type==='boolean'" v-model="state[field.key]" /><USelect v-else-if="field.type==='select'" v-model="state[field.key]" :items="field.options" class="w-full" /><UTextarea v-else-if="field.type==='textarea'" v-model="state[field.key]" class="w-full" /><UInput v-else v-model="state[field.key]" :type="field.type||'text'" :step="field.type==='number'?'any':undefined" class="w-full" /></UFormField></div>
<div v-if="key==='products'" class="space-y-3"><div class="flex justify-between items-center"><h3 class="font-medium">Variants</h3><UButton size="xs" variant="soft" @click="state.variants.push({attribute:'',value:'',extraPrice:'0'})">Add variant</UButton></div><div v-for="(v,i) in state.variants" :key="i" class="flex flex-wrap gap-2"><UInput v-model="v.attribute" placeholder="Attribute (e.g. Brand)" aria-label="Variant attribute" /><UInput v-model="v.value" placeholder="Value (e.g. Odoo)" aria-label="Variant value" /><UInput v-model="v.extraPrice" type="number" step="any" placeholder="Extra price ₹" aria-label="Variant extra price" /><UButton icon="i-lucide-x" color="error" variant="ghost" aria-label="Remove variant" @click="state.variants.splice(i,1)" /></div></div>
<UFormField v-if="key==='discounts' && state.scope==='PRODUCT'" label="Products"><USelect v-model="state.productIds" multiple :items="(products?.items || []).map(p=>({label:p.name,value:p.id}))" class="w-full" /></UFormField><div class="flex justify-end gap-2"><UButton color="neutral" variant="ghost" @click="open=false">Cancel</UButton><UButton type="submit" :loading="busy">Save changes</UButton></div></form></template></UModal></div></template>
