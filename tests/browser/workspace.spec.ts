import { test, expect } from '@playwright/test';

const user={id:'admin',name:'Meera Admin',email:'admin@example.test',role:'ADMIN',customerId:null};
const customer={id:'customer',name:'Asha Retail',email:'asha@example.test',company:'Asha Retail'};
const plan={id:'plan',name:'Growth',interval:'MONTHLY',price:10000,active:true,closable:true,renewable:true,pausable:true};
const sub={id:'sub',number:'SUB/2026/00001',customer,plan,status:'ACTIVE',startDate:'2026-10-01',expiryDate:'2026-12-01',mrr:10000,periodTotal:10000,lines:[],timeline:[],invoices:[],nextInvoice:null};
const invoice={id:'invoice',number:'INV/2026/00001',customer,subscription:sub,status:'CONFIRMED',issueDate:'2026-10-01',dueDate:'2026-10-15',total:10000,amountPaid:0,amountDue:10000,subtotal:10000,discountTotal:0,taxTotal:0,lines:[],payments:[]};

test.beforeEach(async ({page})=>{
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path.startsWith('/api/_nuxt_icon')) return route.continue();
  let body:unknown={items:[],total:0};
  if(path==='/api/auth/me')body=user;
  else if(path==='/api/ai/status')body={enabled:false};
  else if(path==='/api/events')return route.fulfill({status:200,contentType:'text/event-stream',body:': connected\n\n'});
  else if(path==='/api/dashboard')body={kpis:{mrr:10000,activeSubscriptions:1,collectedThisMonth:5000,outstanding:10000,overdue:10000,overdueCount:1},series:[{month:'2026-10',invoiced:10000,collected:5000}],aging:[{bucket:'1-30',amount:10000}],topOverdue:[{...invoice,customer:customer.name}],mrrByPlan:[]};
  else if(path==='/api/plans')body={items:[plan]};
  else if(path==='/api/customers/options')body={items:[customer]};
  else if(path==='/api/products')body={items:[{id:'product',name:'Cloud service',type:'SERVICE',salesPrice:10000,costPrice:0,active:true,variants:[]}]};
  else if(path==='/api/subscriptions/sub')body=sub;
  else if(path==='/api/invoices/invoice')body=invoice;
  await route.fulfill({json:body});
 });
});

test('workspace routes render without runtime errors or horizontal overflow',async ({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const pages:[string,string][]=[['/','Overview'],['/products','Products'],['/plans','Plans'],['/customers','Customers'],['/subscriptions','Subscriptions'],['/subscriptions/new','Create subscription'],['/subscriptions/sub','SUB/2026/00001'],['/invoices/invoice','INV/2026/00001'],['/payments','Payments'],['/templates/new','Create quotation template'],['/reconcile','Bank reconciliation'],['/import','Import subscriptions']];
 for(const [url,title] of pages){await page.goto(url);await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}
 await page.goto('/');await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();await page.screenshot({path:`test-results/dashboard-${info.project.name}.png`,fullPage:true});
 expect(errors).toEqual([]);
});

test('product editor submits rupees once and preserves validation',async({page})=>{
 await page.goto('/products');await page.getByRole('button',{name:'Add product',exact:true}).click();
 await page.getByLabel('Name',{exact:true}).fill('New service');await page.getByLabel('Sales price (₹)',{exact:true}).fill('123.45');await page.getByLabel('Cost price (₹)',{exact:true}).fill('10');
 const request=page.waitForRequest(r=>r.url().endsWith('/api/products')&&r.method()==='POST');await page.getByRole('button',{name:'Save changes'}).click();expect((await request).postDataJSON().salesPrice).toBe(123.45);
});

test('customer discovers subscriptions from Gmail without uploading files',async({page})=>{
 await page.route('**/api/auth/me',r=>r.fulfill({json:{...user,role:'CUSTOMER',customerId:'customer'}}));
 await page.route('**/api/gmail',r=>r.fulfill({json:{connected:true,email:'customer@example.test'}}));
 let batches=0;
 await page.route('**/api/gmail/scan',r=>{batches++;return r.fulfill({json:{scanned:30,nextPageToken:batches===1?'next-page':null,candidates:[{name:'Netflix',amount:649,interval:'MONTHLY',nextRenewal:'2026-12-01',status:'ACTIVE',managementUrl:'https://www.netflix.com/YourAccount',notes:'',confidence:'NEEDS_REVIEW',receiptDate:'2026-10-01',evidence:'Receipt found. Review before saving.'}]}})});
 await page.route('**/api/external-subscriptions',r=>r.fulfill({json:{items:[],totals:{active:0,monthly:0,yearly:0}}}));
 await page.goto('/portal/external');await expect(page.locator('input[type=file]')).toHaveCount(0);
 await page.getByRole('button',{name:'Scan mailbox'}).click();await expect(page.getByText(/60 emails checked/)).toBeVisible();
 await page.getByRole('button',{name:'Review & add'}).click();await expect(page.getByLabel('Service name')).toHaveValue('Netflix');expect(batches).toBe(2);
});

test('Google login opens a branded popup and completes in the original window',async({page})=>{
 await page.route('**/api/auth/providers',r=>r.fulfill({json:{google:true}}));
 await page.context().route('**/api/auth/google?popup=1',r=>r.fulfill({contentType:'text/html',body:'<script>window.opener.postMessage({type: \'brightloop:google-complete\'}, location.origin)</script>'}));
 await page.goto('/login');const button=page.getByRole('button',{name:'Continue with Google'});await expect(button.locator('svg')).toBeVisible();
 const opened=page.waitForEvent('popup');await button.click();const popup=await opened;expect(popup).toBeTruthy();
 await expect(page.getByRole('heading',{name:'Overview',exact:true})).toBeVisible();
});
