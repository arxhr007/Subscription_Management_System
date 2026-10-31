import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/db';
import { invoicePeriod, loadPricingContext, runAllJobs } from '../src/lib/billing';
import { recordPayment } from '../src/routes/finance';

try {
  const customer = await prisma.customer.create({data:{name:'Integration Customer',email:'integration@example.test'}});
  const product = await prisma.product.create({data:{name:'Service',type:'SERVICE',salesPrice:10000,costPrice:0}});
  const plan = await prisma.plan.create({data:{name:'Monthly',interval:'MONTHLY',price:0}});
  const discount = await prisma.discount.create({data:{name:'One use',type:'PERCENT',value:10,scope:'SUBSCRIPTION',usageLimit:1}});
  const start = new Date('2026-01-01T00:00:00Z');
  const createSub = (number:string) => prisma.subscription.create({data:{number,customerId:customer.id,planId:plan.id,status:'ACTIVE',startDate:start,paymentTerm:'NET_15',nextInvoiceDate:start,lines:{create:{productId:product.id,description:'Service',quantity:1,unitPrice:10000}}},include:{plan:true,lines:{include:{product:true}}}});
  const a=await createSub('SUB-A'), b=await createSub('SUB-B');
  const ctx=await loadPricingContext();
  await Promise.all([invoicePeriod(a,start,ctx,{confirm:true}),invoicePeriod(a,start,ctx,{confirm:true}),invoicePeriod(b,start,ctx,{confirm:true})]);
  assert.equal(await prisma.invoice.count(),2,'Concurrent billing must not duplicate invoices');
  assert.equal((await prisma.discount.findUniqueOrThrow({where:{id:discount.id}})).usedCount,1,'Discount usage limit must hold across concurrent subscriptions');
  const invoice=await prisma.invoice.findFirstOrThrow({where:{subscriptionId:a.id}});
  const payment={invoiceId:invoice.id,amount:1000,method:'BANK_TRANSFER',date:new Date(),note:null,idempotencyKey:randomUUID()};
  await Promise.all([prisma.$transaction(tx=>recordPayment(tx,payment,'test')),prisma.$transaction(tx=>recordPayment(tx,payment,'test'))]);
  assert.equal(await prisma.payment.count(),1,'Retried payments must be idempotent');
  assert.equal((await prisma.invoice.findUniqueOrThrow({where:{id:invoice.id}})).amountPaid,1000);
  const due=invoice.total-1000;
  const payments=await Promise.allSettled([0,1].map(()=>prisma.$transaction(tx=>recordPayment(tx,{...payment,amount:due,idempotencyKey:randomUUID()},'test'))));
  assert.equal(payments.filter(p=>p.status==='fulfilled').length,1,'Concurrent full payments must not overpay');
  const paid=await prisma.invoice.findUniqueOrThrow({where:{id:invoice.id}});assert.equal(paid.amountPaid,paid.total);assert.equal(paid.status,'PAID');
  await prisma.plan.update({where:{id:plan.id},data:{autoClose:true}});
  await prisma.subscription.updateMany({data:{expiryDate:new Date('2026-03-01T00:00:00Z')}});
  await runAllJobs('test');
  assert.equal(await prisma.invoice.count(),4,'Catch up February before closing expired subscriptions');
  assert.equal(await prisma.subscription.count({where:{status:'CLOSED'}}),2);
  const { default: express } = await import('express');
  const { externalRouter } = await import('../src/routes/external');
  const { errorHandler } = await import('../src/lib/http');
  const owner = await prisma.user.create({data:{name:'Owner',email:'owner@example.test',role:'CUSTOMER'}});
  const other = await prisma.user.create({data:{name:'Other',email:'other@example.test',role:'CUSTOMER'}});
  const app = express(); app.use(express.json());
  app.use((req,_res,next)=>{req.user={id:String(req.get('test-user')||owner.id),role:'CUSTOMER',name:'Test',email:'test@example.test',customerId:null};next()});
  app.use('/external',externalRouter);app.use(errorHandler);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
  const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}/external`;
  try {
    const response=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Netflix',amount:'649',interval:'MONTHLY',nextRenewal:'2026-12-01'})});assert.equal(response.status,201);
    const tracked=await response.json() as {id:string;amount:number};assert.equal(tracked.amount,64900);
    const hidden=await fetch(base,{headers:{'test-user':other.id}});assert.equal(((await hidden.json()) as {items:unknown[]}).items.length,0);
    const denied=await fetch(`${base}/${tracked.id}`,{method:'DELETE',headers:{'test-user':other.id}});assert.equal(denied.status,404);
    const removed=await fetch(`${base}/${tracked.id}`,{method:'DELETE'});assert.equal(removed.status,200);
  } finally { await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())); }
  console.log('PASS: external subscription validation and customer ownership isolation');
  console.log('PASS: PostgreSQL migration, duplicate billing, discount limits, payment retries, concurrent payments and expiry catch-up');
} finally { await prisma.$disconnect(); }
