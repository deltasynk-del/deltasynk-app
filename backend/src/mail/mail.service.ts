import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type Transporter from 'nodemailer/lib/mailer';

export interface SendMailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: Transporter | null = null;
  private readonly fromAddress: string;
  private readonly fromName: string;

  constructor(private readonly configService: ConfigService) {
    this.fromAddress =
      this.configService.get<string>('MAIL_FROM') ||
      this.configService.get<string>('SMTP_USER') ||
      'noreply@deltasynk.local';
    this.fromName = this.configService.get<string>('MAIL_FROM_NAME') ?? 'DeltaSynk Portal';

    if (this.isConfigured()) {
      this.transporter = nodemailer.createTransport({
        host: this.configService.get<string>('SMTP_HOST'),
        port: Number(this.configService.get<string>('SMTP_PORT') ?? 587),
        secure: this.configService.get<string>('SMTP_SECURE') === 'true',
        auth: {
          user: this.configService.get<string>('SMTP_USER'),
          pass: this.configService.get<string>('SMTP_PASS'),
        },
      });
    }
  }

  isConfigured(): boolean {
    const enabled = this.configService.get<string>('MAIL_ENABLED');
    if (enabled === 'false') {
      return false;
    }
    const host = this.configService.get<string>('SMTP_HOST');
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');
    return Boolean(host && user && pass);
  }

  /** Development only: hand codes/links back in the API response when nothing can deliver them. */
  shouldExposeDevLinks(): boolean {
    return (
      process.env.NODE_ENV !== 'production' &&
      this.configService.get<string>('MAIL_EXPOSE_DEV_LINKS') !== 'false'
    );
  }

  async send(payload: SendMailPayload): Promise<boolean> {
    if (!this.transporter) {
      this.logger.warn(
        `SMTP not configured — skipped sending "${payload.subject}" to ${payload.to}`,
      );
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromAddress}>`,
        to: payload.toName ? `"${payload.toName}" <${payload.to}>` : payload.to,
        subject: payload.subject,
        html: payload.html,
      });
      this.logger.log(`Email sent: "${payload.subject}" → ${payload.to}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send "${payload.subject}" to ${payload.to}: ${message}`);
      return false;
    }
  }
}
