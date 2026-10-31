import nodemailer from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
};

/** Mails "sent" while no SMTP account is configured (tests, local dev). Tests read reset links from here. */
export const outbox: Mail[] = [];

const configured = env.NODE_ENV !== 'test' && !!env.SMTP_HOST && !!env.SMTP_USER && !!env.SMTP_PASS;

const transport = configured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT ?? 2525,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export async function sendMail(mail: Mail): Promise<void> {
  if (!transport) {
    outbox.push(mail);
    logger.info(
      env.NODE_ENV === 'production' ? { to: mail.to, subject: mail.subject } : { to: mail.to, subject: mail.subject, text: mail.text },
      'email (not sent: SMTP not configured)',
    );
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, ...mail });
}
