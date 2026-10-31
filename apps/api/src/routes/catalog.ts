// Customers, products (+variants), plans, taxes and discounts.
// Staff can read everything; only the admin can change products, plans, taxes and discounts.
import { Router } from 'express';
import { customerSchema, discountSchema, listQuerySchema, planSchema, productSchema, taxSchema } from '@brightloop/shared';
import { adminOnly, staffOnly } from '../lib/auth';
import { audit } from '../lib/audit';
import { prisma } from '../lib/db';
import { broadcast } from '../lib/events';
import { notFound, paging, parse } from '../lib/http';

// ---------- Customers ----------

export const customersRouter = Router();
customersRouter.use(staffOnly);

customersRouter.get('/', async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where = q.q ? { OR: [{ name: { contains: q.q } }, { email: { contains: q.q } }, { company: { contains: q.q } }] } : {};
  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where, orderBy: { name: 'asc' }, ...paging(q.page, q.pageSize),
      include: { _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } }, user: { select: { id: true } } },
    }),
    prisma.customer.count({ where }),
  ]);
  res.json({ items, total, page: q.page, pageSize: q.pageSize });
});

customersRouter.get('/options', async (req, res) => {
  const q = String(req.query.q ?? '').slice(0, 60);
  const items = await prisma.customer.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}, orderBy: { name: 'asc' }, take: 20,
    select: { id: true, name: true, email: true, company: true },
  });
  res.json({ items });
});

customersRouter.get('/:id', async (req, res) => {
  const c = await prisma.customer.findUnique({ where: { id: String(req.params.id) } });
  if (!c) throw notFound('Customer');
  res.json(c);
});

customersRouter.post('/', async (req, res) => {
  const c = await prisma.customer.create({ data: parse(customerSchema, req.body) });
  broadcast('customers');
  res.status(201).json(c);
});

customersRouter.put('/:id', async (req, res) => {
  const c = await prisma.customer.update({ where: { id: String(req.params.id) }, data: parse(customerSchema, req.body) });
  broadcast('customers');
  res.json(c);
});

// ---------- Products ----------

export const productsRouter = Router();
productsRouter.use(staffOnly);

productsRouter.get('/', async (req, res) => {
  const q = parse(listQuerySchema, req.query);
  const where = { ...(q.q ? { name: { contains: q.q } } : {}), ...(q.status === 'active' ? { active: true } : {}) };
  const items = await prisma.product.findMany({ where, orderBy: { name: 'asc' }, include: { variants: true } });
  res.json({ items });
});

productsRouter.get('/:id', async (req, res) => {
  const p = await prisma.product.findUnique({ where: { id: String(req.params.id) }, include: { variants: true } });
  if (!p) throw notFound('Product');
  res.json(p);
});

productsRouter.post('/', adminOnly, async (req, res) => {
  const { variants, ...d } = parse(productSchema, req.body);
  const p = await prisma.product.create({ data: { ...d, variants: { create: variants } }, include: { variants: true } });
  broadcast('catalog');
  res.status(201).json(p);
});

productsRouter.put('/:id', adminOnly, async (req, res) => {
  const { variants, ...d } = parse(productSchema, req.body);
  const p = await prisma.$transaction(async (tx) => {
    await tx.productVariant.deleteMany({ where: { productId: String(req.params.id) } });
    return tx.product.update({ where: { id: String(req.params.id) }, data: { ...d, variants: { create: variants } }, include: { variants: true } });
  });
  broadcast('catalog');
  res.json(p);
});

// ---------- Plans ----------

export const plansRouter = Router();
plansRouter.use(staffOnly);

plansRouter.get('/', async (_req, res) => {
  const items = await prisma.plan.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { _count: { select: { subscriptions: { where: { status: 'ACTIVE' } } } } } });
  res.json({ items });
});

plansRouter.post('/', adminOnly, async (req, res) => {
  const p = await prisma.plan.create({ data: parse(planSchema, req.body) });
  broadcast('catalog');
  res.status(201).json(p);
});

plansRouter.put('/:id', adminOnly, async (req, res) => {
  const p = await prisma.plan.update({ where: { id: String(req.params.id) }, data: parse(planSchema, req.body) });
  broadcast('catalog');
  res.json(p);
});

// ---------- Taxes ----------

export const taxesRouter = Router();
taxesRouter.use(staffOnly);

taxesRouter.get('/', async (_req, res) => res.json({ items: await prisma.tax.findMany({ orderBy: { name: 'asc' } }) }));

taxesRouter.post('/', adminOnly, async (req, res) => {
  const t = await prisma.tax.create({ data: parse(taxSchema, req.body) });
  broadcast('catalog');
  res.status(201).json(t);
});

taxesRouter.put('/:id', adminOnly, async (req, res) => {
  const t = await prisma.tax.update({ where: { id: String(req.params.id) }, data: parse(taxSchema, req.body) });
  broadcast('catalog');
  res.json(t);
});

// ---------- Discounts ----------

export const discountsRouter = Router();
discountsRouter.use(staffOnly);

discountsRouter.get('/', async (_req, res) => {
  const items = await prisma.discount.findMany({
    orderBy: { createdAt: 'desc' },
    include: { products: { select: { id: true, name: true } }, subscriptions: { select: { id: true, number: true } } },
  });
  res.json({ items });
});

const discountData = (d: ReturnType<typeof discountSchema.parse>) => {
  const { productIds, subscriptionIds, ...rest } = d;
  return {
    data: rest,
    products: (rest.scope === 'PRODUCT' ? productIds : []).map((id) => ({ id })),
    subscriptions: subscriptionIds.map((id) => ({ id })),
  };
};

discountsRouter.post('/', adminOnly, async (req, res) => {
  const { data, products, subscriptions } = discountData(parse(discountSchema, req.body));
  const d = await prisma.discount.create({ data: { ...data, products: { connect: products }, subscriptions: { connect: subscriptions } } });
  await audit(prisma, 'discount', d.id, 'Created', d.name, req.user!.name);
  broadcast('catalog');
  res.status(201).json(d);
});

discountsRouter.put('/:id', adminOnly, async (req, res) => {
  const { data, products, subscriptions } = discountData(parse(discountSchema, req.body));
  const d = await prisma.discount.update({ where: { id: String(req.params.id) }, data: { ...data, products: { set: products }, subscriptions: { set: subscriptions } } });
  broadcast('catalog');
  res.json(d);
});
