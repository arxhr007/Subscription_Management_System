<script setup lang="ts">
const api=useApi(),toast=useToast(),{user}=useAuth()
const busy=ref(false),err=ref('')
const name=ref(user.value?.name||''),occupation=ref('STUDENT'),budget=ref('')
const interests=ref<string[]>([])
const existingProfile=await useApi()('/advisor/profile').catch(()=>null) as any
if(existingProfile){name.value=existingProfile.name||name.value;occupation.value=existingProfile.occupation||occupation.value;interests.value=[...(existingProfile.interests||[])];budget.value=existingProfile.budget==null?'':String(existingProfile.budget/100)}
const common=[
 {name:'Netflix',category:'Entertainment'},{name:'Spotify',category:'Music'},{name:'YouTube Premium',category:'Entertainment'},
 {name:'Amazon Prime',category:'Entertainment'},{name:'Disney+ Hotstar',category:'Entertainment'},{name:'ChatGPT Plus',category:'AI'},
 {name:'Apple Music',category:'Music'},{name:'iCloud+',category:'Cloud'},{name:'Google One',category:'Cloud'},
 {name:'Notion',category:'Productivity'},{name:'Canva',category:'Design'},{name:'GitHub',category:'Development'},
] as const
const picked=ref<Record<string,string>>({})
const customName=ref('')
function toggle(n:string){n in picked.value?delete picked.value[n]:picked.value[n]=''}
function addCustom(){const n=customName.value.trim();if(n&&!(n in picked.value))picked.value[n]='';customName.value=''}
const interestOptions=['Entertainment','Study','Work','Gaming','Music','Fitness','Reading','Technology']
function toggleInterest(i:string){interests.value=interests.value.includes(i)?interests.value.filter(x=>x!==i):[...interests.value,i]}
// Flashcard deck: one question per card. Picked nothing on card 3? The amounts card drops out.
const card=ref(0)
const cards=computed(()=>{
 const list=['name','role','subs','interests','budget']
 return list
})
const total=computed(()=>cards.value.length)
function next(){if(card.value<total.value-1)card.value++}
function back(){if(card.value>0)card.value--}
function pickRole(v:string){occupation.value=v;setTimeout(next,180)}
async function finish(skipSubs=false){
 busy.value=true;err.value=''
 try{
  if(name.value.trim().length<2){err.value='Add your name on the first card.';card.value=0;return}
  await api('/advisor/profile',{method:'PUT',body:{name:name.value.trim(),occupation:occupation.value,interests:interests.value,activities:'',budget:budget.value===''?null:Number(budget.value),notifications:true}})
  if(!skipSubs){
   const existing=await api<{items:{name:string}[]}>('/external-subscriptions').catch(()=>({items:[]}))
   const have=new Set(existing.items.map(i=>i.name.toLowerCase()))
   const renewal=new Date(Date.now()+30*86400000).toISOString().slice(0,10)
   for(const subName of Object.keys(picked.value)){
    if(have.has(subName.toLowerCase()))continue
    const c=common.find(x=>x.name===subName)
    await api('/external-subscriptions',{method:'POST',body:{name:subName,amount:0,interval:'MONTHLY',nextRenewal:renewal,status:'ACTIVE',category:c?.category||'Other',usage:'UNKNOWN',importance:3,purpose:'',managementUrl:'',notes:'Added in setup. Amount and renewal date not confirmed yet — update anytime in Subscriptions.'}})
   }
  }
  useState('onboarded:'+user.value!.id).value=true
  toast.add({title:'You are in. Add details anytime.',color:'success'});await navigateTo('/portal')
 }catch(e){err.value=errorMessage(e)}finally{busy.value=false}
}
</script>
<template>
 <div class="page max-w-xl mx-auto py-4">
  <div class="text-center space-y-1.5 mb-6">
   <h1 class="text-2xl font-semibold tracking-tight">Quick setup</h1>
   <p class="text-sm text-muted">One card at a time. Tap through — done in 30 seconds.</p>
  </div>
  <UAlert v-if="err" color="error" :title="err" class="mb-4"/>
  <!-- deck: current card on top, next cards peeking behind -->
  <div class="relative">
   <div v-if="card<total-2" class="absolute inset-x-4 top-3 bottom-0 rounded-2xl border border-default bg-elevated/40 translate-y-3 scale-[0.96]" aria-hidden="true"/>
   <div v-if="card<total-1" class="absolute inset-x-2 top-1.5 bottom-0 rounded-2xl border border-default bg-elevated/70 translate-y-1.5 scale-[0.98]" aria-hidden="true"/>
   <div class="relative rounded-2xl border border-default bg-[var(--ui-bg)] shadow-xl p-6 sm:p-8 min-h-96 flex flex-col">
    <div class="flex items-center justify-between">
     <span class="text-xs font-medium text-muted">Card {{card+1}} of {{total}}</span>
     <div class="flex gap-1.5"><span v-for="i in total" :key="i" class="h-1.5 rounded-full transition-all" :class="i-1===card?'w-6 bg-primary':i-1<card?'w-1.5 bg-primary/50':'w-1.5 bg-elevated'"/></div>
    </div>
    <!-- 1 · name -->
    <div v-if="cards[card]==='name'" class="flex-1 flex flex-col justify-center space-y-4 py-6">
     <p class="text-3xl" aria-hidden="true">👋</p>
     <h2 class="text-xl font-semibold">What should we call you?</h2>
     <UInput v-model="name" size="xl" placeholder="Your name" autofocus class="w-full" @keyup.enter="name.trim().length>=2&&next()"/>
     <p class="text-xs text-muted">Only this card is required. Everything else is skippable.</p>
    </div>
    <!-- 2 · role -->
    <div v-else-if="cards[card]==='role'" class="flex-1 flex flex-col justify-center space-y-4 py-6">
     <p class="text-3xl" aria-hidden="true">🎓</p>
     <h2 class="text-xl font-semibold">I am a…</h2>
     <p class="text-sm text-muted -mt-2">Tap one — it moves you to the next card.</p>
     <div class="grid grid-cols-2 gap-3">
      <button v-for="o in [{label:'Student',icon:'🎒',value:'STUDENT'},{label:'Professional',icon:'💼',value:'PROFESSIONAL'},{label:'Freelancer / creator',icon:'🎨',value:'FREELANCER'},{label:'Other',icon:'✨',value:'OTHER'}]" :key="o.value" class="rounded-xl border p-4 text-left transition-colors" :class="occupation===o.value?'border-primary bg-primary/10':'border-default hover:bg-elevated/60'" @click="pickRole(o.value)"><span class="text-2xl block" aria-hidden="true">{{o.icon}}</span><span class="text-sm font-medium block mt-2">{{o.label}}</span></button>
     </div>
    </div>
    <!-- 3 · subscriptions -->
    <div v-else-if="cards[card]==='subs'" class="flex-1 flex flex-col justify-center space-y-4 py-6">
     <p class="text-3xl" aria-hidden="true">📺</p>
     <h2 class="text-xl font-semibold">Which of these do you pay for?</h2>
     <p class="text-sm text-muted -mt-2">Tap all that apply — or none. Add prices later in Subscriptions only if you want to.</p>
     <div class="flex flex-wrap gap-2">
      <UButton v-for="c in common" :key="c.name" size="lg" :color="c.name in picked?'primary':'neutral'" :variant="c.name in picked?'solid':'outline'" :icon="c.name in picked?'i-lucide-check':undefined" @click="toggle(c.name)">{{c.name}}</UButton>
     </div>
     <div class="flex gap-2"><UInput v-model="customName" placeholder="Something else? Type the name" class="flex-1" @keyup.enter.prevent="addCustom"/><UButton color="neutral" variant="outline" @click="addCustom">Add</UButton></div>
    </div>
    <!-- 4 · interests -->
    <div v-else-if="cards[card]==='interests'" class="flex-1 flex flex-col justify-center space-y-4 py-6">
     <p class="text-3xl" aria-hidden="true">🎯</p>
     <h2 class="text-xl font-semibold">Into any of these?</h2>
     <p class="text-sm text-muted -mt-2">Optional. Helps us time advice around your life.</p>
     <div class="flex flex-wrap gap-2">
      <UButton v-for="i in interestOptions" :key="i" size="lg" :color="interests.includes(i)?'primary':'neutral'" :variant="interests.includes(i)?'solid':'outline'" :icon="interests.includes(i)?'i-lucide-check':undefined" @click="toggleInterest(i)">{{i}}</UButton>
     </div>
    </div>
    <!-- 5 · budget -->
    <div v-else-if="cards[card]==='budget'" class="flex-1 flex flex-col justify-center space-y-4 py-6">
     <p class="text-3xl" aria-hidden="true">🏁</p>
     <h2 class="text-xl font-semibold">Last one — monthly budget?</h2>
     <p class="text-sm text-muted -mt-2">Optional. We'll flag it when active subscriptions go over. No payments, no auto-cancel — ever.</p>
     <UInput v-model="budget" type="number" min="0" step="0.01" size="xl" placeholder="e.g. 1500  (₹ per month)" class="w-full"/>
    </div>
    <!-- nav -->
    <div class="flex items-center justify-between pt-4 border-t border-default">
     <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" :disabled="card===0" @click="back">Back</UButton>
     <UButton v-if="card<total-1" size="lg" trailing-icon="i-lucide-arrow-right" :disabled="cards[card]==='name'&&name.trim().length<2" @click="next">Next card</UButton>
     <UButton v-else size="lg" icon="i-lucide-check" :loading="busy" @click="finish(false)">Finish — show my advisor</UButton>
    </div>
   </div>
  </div>
  <div class="text-center mt-5">
   <UButton color="neutral" variant="link" :disabled="busy" @click="finish(true)">Skip setup entirely →</UButton>
  </div>
 </div>
</template>
