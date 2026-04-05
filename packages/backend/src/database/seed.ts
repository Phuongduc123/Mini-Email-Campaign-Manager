/**
 * Seed script — generates realistic mock data:
 *   - 1 demo user (or reuses existing)
 *   - 300 recipients
 *   - 2000 campaigns with mixed statuses + campaign_recipients links
 *
 * Usage:
 *   yarn workspace backend seed
 *
 * Safe to re-run: skips existing recipients/user by email.
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import bcrypt from 'bcryptjs';
import '../database/models/index';
import { sequelize, connectDatabase } from '../config/database';
import { User } from './models/User';
import { Campaign } from './models/Campaign';
import { Recipient } from './models/Recipient';
import { CampaignRecipient } from './models/CampaignRecipient';

// ── helpers ──────────────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function daysFromNow(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
}

// ── content pools ─────────────────────────────────────────────────────────────

const FIRST_NAMES = [
  'Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry',
  'Isabella', 'Jack', 'Karen', 'Liam', 'Mia', 'Noah', 'Olivia', 'Peter',
  'Quinn', 'Rachel', 'Sam', 'Tina', 'Uma', 'Victor', 'Wendy', 'Xander',
  'Yara', 'Zoe', 'Aaron', 'Bella', 'Carlos', 'Diana', 'Ethan', 'Fiona',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller',
  'Davis', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Jackson', 'White',
  'Harris', 'Martin', 'Thompson', 'Lee', 'Walker', 'Hall', 'Allen', 'Young',
];

const DOMAINS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com',
  'protonmail.com', 'example.com', 'test.org', 'company.io', 'work.dev',
];

const CAMPAIGN_TOPICS = [
  { name: 'Black Friday Sale', subject: '🛍️ Black Friday: Up to 70% off — Today Only!' },
  { name: 'Welcome Series #1', subject: 'Welcome aboard! Here\'s how to get started' },
  { name: 'Weekly Newsletter', subject: 'Your weekly digest — top stories this week' },
  { name: 'Product Launch', subject: 'Introducing our newest feature — you\'ll love this' },
  { name: 'Re-engagement', subject: 'We miss you! Here\'s 20% off to come back' },
  { name: 'Monthly Digest', subject: 'Your monthly summary is ready' },
  { name: 'Flash Sale', subject: '⚡ 24-hour flash sale — ends tonight!' },
  { name: 'Customer Survey', subject: 'Quick question: how are we doing?' },
  { name: 'Abandoned Cart', subject: 'You left something behind…' },
  { name: 'Holiday Greetings', subject: 'Happy holidays from our team 🎉' },
  { name: 'Feature Update', subject: 'New update: here\'s what changed' },
  { name: 'Webinar Invite', subject: 'Join us live — register now (spots limited)' },
  { name: 'Referral Program', subject: 'Earn $20 for every friend you refer' },
  { name: 'Renewal Reminder', subject: 'Your subscription renews in 7 days' },
  { name: 'Onboarding Step 2', subject: 'Next step: set up your profile' },
  { name: 'Case Study', subject: 'How [Customer] grew 3x using our platform' },
  { name: 'Tip of the Week', subject: '💡 Pro tip: save 2 hours every week with this trick' },
  { name: 'End of Year Sale', subject: 'Last chance: year-end deals expire Dec 31' },
  { name: 'Beta Invitation', subject: 'You\'re invited to try our private beta' },
  { name: 'Loyalty Reward', subject: 'You\'ve earned a reward — claim it now' },
];

const BODY_TEMPLATES = [
  (name: string) => `<p>Hi {{name}},</p><p>${name} — we have an exciting update for you. Check out what's new and take action today.</p><p>Best,<br/>The Team</p>`,
  (name: string) => `<p>Hello {{name}},</p><p>We're reaching out about <strong>${name}</strong>. Don't miss this limited-time opportunity.</p><p>Click the button below to learn more.</p><p>Cheers,<br/>The Team</p>`,
  (name: string) => `<p>Hey {{name}},</p><p>Just a quick note about <em>${name}</em>. We think you'll find this valuable.</p><p>Let us know if you have any questions!</p>`,
];

// ── status distribution ───────────────────────────────────────────────────────
// 2000 campaigns: 40% sent, 20% draft, 20% scheduled, 10% sending, 10% sent (older)
const STATUS_WEIGHTS: Array<{ status: 'draft' | 'scheduled' | 'sending' | 'sent'; weight: number }> = [
  { status: 'sent',      weight: 50 },
  { status: 'draft',     weight: 25 },
  { status: 'scheduled', weight: 15 },
  { status: 'sending',   weight: 10 },
];

function pickStatus(): 'draft' | 'scheduled' | 'sending' | 'sent' {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const w of STATUS_WEIGHTS) {
    r -= w.weight;
    if (r <= 0) return w.status;
  }
  return 'draft';
}

// ── main ──────────────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  await connectDatabase();
  console.log('Connected to database.');

  const t = await sequelize.transaction();

  try {
    // ── 1. Demo user ──────────────────────────────────────────────────────────
    console.log('Creating demo user...');
    const passwordHash = await bcrypt.hash('password123', 10);
    const [user] = await User.findOrCreate({
      where: { email: 'demo@example.com' },
      defaults: { name: 'Demo User', email: 'demo@example.com', passwordHash },
      transaction: t,
    });
    console.log(`  User: demo@example.com / password123 (id=${user.id})`);

    // ── 2. Recipients ─────────────────────────────────────────────────────────
    console.log('Creating 300 recipients...');
    const existingEmails = new Set(
      (await Recipient.findAll({ attributes: ['email'], transaction: t })).map((r) => r.email),
    );

    const recipientRows: Array<{ email: string; name: string }> = [];
    const usedEmails = new Set(existingEmails);

    while (recipientRows.length < 300) {
      const first = pick(FIRST_NAMES);
      const last = pick(LAST_NAMES);
      const domain = pick(DOMAINS);
      const suffix = randInt(1, 999);
      const email = `${first.toLowerCase()}.${last.toLowerCase()}${suffix}@${domain}`;
      if (!usedEmails.has(email)) {
        usedEmails.add(email);
        recipientRows.push({ name: `${first} ${last}`, email });
      }
    }

    const recipients = await Recipient.bulkCreate(recipientRows, {
      transaction: t,
      returning: true,
    });
    const recipientIds = recipients.map((r) => r.id);
    console.log(`  Created ${recipients.length} recipients.`);

    // ── 3. Campaigns + campaign_recipients ────────────────────────────────────
    console.log('Creating 2000 campaigns...');

    const BATCH = 100; // insert in batches to avoid huge single queries
    let totalCampaigns = 0;

    for (let batch = 0; batch < 2000 / BATCH; batch++) {
      const campaignRows = [];

      for (let i = 0; i < BATCH; i++) {
        const topic = pick(CAMPAIGN_TOPICS);
        const status = pickStatus();
        const createdDaysAgo = randInt(1, 365);
        const createdAt = daysAgo(createdDaysAgo);

        let scheduledAt: Date | null = null;
        let sentCount = 0;
        let failedCount = 0;
        let totalRecipientsCount = 0;

        if (status === 'scheduled') {
          scheduledAt = daysFromNow(randInt(1, 30));
        } else if (status === 'sending') {
          totalRecipientsCount = randInt(5, 50);
          // partially sent
          sentCount = randInt(1, Math.floor(totalRecipientsCount * 0.7));
          failedCount = randInt(0, Math.floor(totalRecipientsCount * 0.1));
        } else if (status === 'sent') {
          totalRecipientsCount = randInt(5, 50);
          const failRate = Math.random() * 0.25; // 0–25% fail
          failedCount = Math.round(totalRecipientsCount * failRate);
          sentCount = totalRecipientsCount - failedCount;
          scheduledAt = Math.random() > 0.6 ? daysAgo(randInt(1, createdDaysAgo)) : null;
        }

        const bodyFn = pick(BODY_TEMPLATES);
        campaignRows.push({
          name: `${topic.name} #${totalCampaigns + i + 1}`,
          subject: topic.subject,
          body: bodyFn(topic.name),
          status,
          scheduledAt,
          createdBy: user.id,
          sentCount,
          failedCount,
          totalRecipients: totalRecipientsCount,
          createdAt,
          updatedAt: createdAt,
        });
      }

      const campaigns = await Campaign.bulkCreate(campaignRows, {
        transaction: t,
        returning: true,
      });

      // Link each campaign to a random subset of recipients
      const crRows: Array<{
        campaignId: number;
        recipientId: number;
        status: 'pending' | 'sent' | 'failed';
        sentAt: Date | null;
        openedAt: Date | null;
        errorMessage: string | null;
        retryCount: number;
      }> = [];

      for (const campaign of campaigns) {
        // pick 5–50 random recipients for this campaign
        const count = randInt(5, 50);
        const shuffled = [...recipientIds].sort(() => Math.random() - 0.5).slice(0, count);

        for (const recipientId of shuffled) {
          let crStatus: 'pending' | 'sent' | 'failed' = 'pending';
          let sentAt: Date | null = null;
          let openedAt: Date | null = null;
          let errorMessage: string | null = null;

          if (campaign.status === 'sent') {
            const r = Math.random();
            if (r < 0.75) {
              crStatus = 'sent';
              sentAt = new Date(campaign.createdAt.getTime() + randInt(60_000, 3_600_000));
              // ~35% open rate on sent
              if (Math.random() < 0.35) {
                openedAt = new Date(sentAt.getTime() + randInt(60_000, 86_400_000));
              }
            } else {
              crStatus = 'failed';
              errorMessage = 'Simulated SMTP delivery failure.';
            }
          } else if (campaign.status === 'sending') {
            const r = Math.random();
            crStatus = r < 0.6 ? 'sent' : r < 0.7 ? 'failed' : 'pending';
            if (crStatus === 'sent') {
              sentAt = new Date(Date.now() - randInt(60_000, 600_000));
              if (Math.random() < 0.35) {
                openedAt = new Date(sentAt.getTime() + randInt(60_000, 3_600_000));
              }
            } else if (crStatus === 'failed') {
              errorMessage = 'Simulated SMTP delivery failure.';
            }
          }

          crRows.push({
            campaignId: campaign.id,
            recipientId,
            status: crStatus,
            sentAt,
            openedAt,
            errorMessage,
            retryCount: 0,
          });
        }
      }

      await CampaignRecipient.bulkCreate(crRows, {
        transaction: t,
        ignoreDuplicates: true,
      });

      totalCampaigns += campaigns.length;
      process.stdout.write(`\r  ${totalCampaigns}/2000 campaigns created...`);
    }

    console.log(`\n  Done — ${totalCampaigns} campaigns with recipient links.`);

    await t.commit();
    console.log('\n✓ Seed complete!');
    console.log('  Login: demo@example.com / password123');
  } catch (err) {
    await t.rollback();
    console.error('Seed failed, rolled back:', err);
    process.exit(1);
  }

  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
