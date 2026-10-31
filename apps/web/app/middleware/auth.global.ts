export default defineNuxtRouteMiddleware(async to=>{
 const publicPaths=['/login','/signup','/auth/complete','/forgot-password','/auth/reset']
 if(publicPaths.includes(to.path))return
 const {user,refresh}=useAuth()
 if(!user.value){try{await refresh()}catch{return navigateTo('/login')}}
 if(!user.value)return navigateTo('/login')
 // Business workspace (Brightloop): staff/admin only, no advisor onboarding gate
 if(!to.path.startsWith('/portal')){
   if(user.value.role==='CUSTOMER')return navigateTo('/portal')
   return
 }
 if(to.path==='/portal/onboarding')return
 const onboarded=useState<boolean|null>('onboarded:'+user.value.id,()=>null)
 if(onboarded.value===null){const profile=await useApi()('/advisor/profile');onboarded.value=!!profile}
 if(!onboarded.value)return navigateTo('/portal/onboarding')
})
