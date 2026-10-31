import { test, expect } from '@playwright/test';
test('advisor pages render on desktop and mobile without overflow',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/_nuxt_icon'))return route.continue();
  let body:unknown={items:[]};
  if(path==='/api/auth/me')body={id:'review',name:'Asha',role:'CUSTOMER',email:'asha@example.test',customerId:null};
  if(path==='/api/advisor/profile')body={name:'Asha',occupation:'STUDENT',interests:['Music'],activities:'Exams',budget:200000,notifications:true};
  if(path==='/api/calendar')body={connected:false};
  if(path==='/api/advisor/plan')body={profile:{occupation:'student',monthly_budget:{target:2000},planning_period:{start:'2026-10-31',end:'2027-01-31'}},financial_settings:{current_active_monthly:2500,potential_monthly_savings:100},subscriptions:[],timeline:[],optimization_rules:[]};
  if(path==='/api/advisor/overview')body={profile:{name:'Asha'},subscriptions:[],activities:[{id:'exam',title:'Study week',kind:'EXAM',source:'GOOGLE',startDate:new Date().toISOString(),endDate:new Date(Date.now()+86400000*3).toISOString()}],intentions:[],renewals:[],categoryTotals:[],feedback:[],totals:{monthly:250000,yearly:3000000,active:3,planned:0,potentialMonthly:10000,budget:200000,budgetRemaining:-50000},recommendations:[{key:'review',action:'RECONSIDER',title:'Review your streaming plan',reason:'You reported low usage.',financialImpact:'Review before renewal.',ifIgnored:'Your service continues.',potentialMonthly:10000,priority:90,subscriptionId:'sub',date:null,activity:null}]};
  if(path==='/api/external-subscriptions')body={items:[],totals:{monthly:0,yearly:0,active:0}};
  await route.fulfill({json:body});
 });
 for(const url of ['/portal','/portal/recommendations','/portal/timeline','/portal/subscriptions','/portal/preferences']){
  await page.goto(url);await expect(page.locator('.page h1')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  if(url==='/portal/timeline'){await expect(page.locator('.activity-calendar').getByText('Study week').first()).toBeVisible();await page.getByRole('button',{name:'Renewals',exact:true}).click();await expect(page.locator('.activity-calendar').getByText('Study week')).toHaveCount(0);await page.getByRole('button',{name:'All events',exact:true}).click();}
  await page.screenshot({path:`test-results/${url.split('/').at(-1)}-${info.project.name}.png`,fullPage:true});
 }
 await page.goto('/portal');await expect(page.getByText(/125%/)).toBeVisible();
 await page.goto('/portal/recommendations');await page.getByRole('button',{name:'Keep',exact:true}).click();await expect(page.getByText('Review your streaming plan')).toHaveCount(0);
 // Client navigation exercises Vue's mount/unmount lifecycle; page.goto alone cannot catch it.
 async function navigate(name:string){
  if(info.project.name==='mobile')await page.getByRole('button',{name:'Open sidebar',exact:true}).click();
  await page.getByRole('link',{name,exact:true}).first().click();
 }
 for(let pass=0;pass<2;pass++)for(const name of ['Plan','Calendar','Subscriptions','Recommendations','Advisor']){
  await navigate(name);
  await expect(page.locator('.page h1')).toBeVisible();
 }
 await navigate('Calendar');
 await expect(page.locator('.calendar-grid')).toBeVisible();
 await page.getByRole('button',{name:'Add activity',exact:true}).click();await expect(page.getByLabel('Title',{exact:true})).toBeVisible();await page.getByRole('button',{name:'Cancel',exact:true}).click();
 expect(errors).toEqual([]);
});
