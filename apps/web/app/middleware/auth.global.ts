export default defineNuxtRouteMiddleware(async to=>{
 if(['/login','/signup','/auth/complete'].includes(to.path))return
 const {user,refresh}=useAuth()
 if(!user.value){try{await refresh()}catch{return navigateTo('/login')}}
 if(!user.value)return navigateTo('/login')
 if(!to.path.startsWith('/portal'))return navigateTo('/portal')
 if(to.path==='/portal/onboarding')return
 const onboarded=useState<boolean|null>('onboarded:'+user.value.id,()=>null)
 if(onboarded.value===null){const profile=await useApi()('/advisor/profile');onboarded.value=!!profile}
 if(!onboarded.value)return navigateTo('/portal/onboarding')
})
