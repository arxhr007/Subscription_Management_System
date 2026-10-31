// Every email is stored in the local Outbox (works offline). If SMTP_URL is set it is also sent for real.
import nodemailer from 'nodemailer';
import { prisma } from './db';
import { broadcast } from './events';

const transport = process.env.SMTP_URL ? nodemailer.createTransport(process.env.SMTP_URL) : null;

export async function sendMail(to: string, subject: string, body: string) {
  await prisma.email.create({ data: { to, subject, body } });
  broadcast('outbox');
  if (transport) {
    transport.sendMail({ from: 'Brightloop Billing <billing@brightloop.local>', to, subject, text: body })
      .catch((e) => console.warn(`[mail] SMTP send failed, kept in Outbox: ${e.message}`));
  }
}
