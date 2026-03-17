/**
 * Migration script: download files referenced by Supabase public URLs and upload them to Yandex Object Storage.
 *
 * Usage:
 *   node scripts/migrate_supabase_to_yc.js --confirm
 *
 * Safety:
 *   By default the script does a dry-run and prints how many items would be migrated.
 *   Pass --confirm to perform changes.
 */
const fetch = global.fetch || require('node-fetch');
const path = require('path');
const { randomUUID } = require('crypto');

async function main() {
  const doConfirm = process.argv.includes('--confirm');
  console.log('Starting migration (confirm mode=%s)', doConfirm);

  const sequelize = require('../server/db');
  const models = require('../server/models/models');
  const storage = require('../server/services/storageService');

  await sequelize.authenticate();

  // Helpers
  function looksLikeSupabase(url) {
    return typeof url === 'string' && url.includes('.supabase.co');
  }

  async function downloadUrlToBuffer(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download ${url}: ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async function migrateUsersAvatars() {
    const { User } = models;
    const rows = await User.findAll({ where: { avatarUrl: sequelize.literal(`avatarUrl LIKE '%supabase.co%'`) } });
    console.log('Found %d user avatars to migrate', rows.length);
    if (!doConfirm) return;
    for (const u of rows) {
      try {
        const buf = await downloadUrlToBuffer(u.avatarUrl);
        const ext = path.extname(new URL(u.avatarUrl).pathname) || '.bin';
        const key = `users/${u.id}/avatars/${randomUUID()}${ext}`;
        await storage.uploadFile(buf, key, null);
        const newUrl = await storage.getFileUrl(key);
        await u.update({ avatarUrl: newUrl });
        console.log('Migrated avatar for user', u.id, '->', newUrl);
      } catch (e) {
        console.error('Failed to migrate avatar for user', u.id, e && e.message);
      }
    }
  }

  async function migrateMaterialFiles() {
    const { MaterialFile, MaterialCard } = models;
    const rows = await MaterialFile.findAll({ where: { fileUrl: sequelize.literal(`"fileUrl" LIKE '%supabase.co%'`) } });
    console.log('Found %d material files to migrate', rows.length);
    if (!doConfirm) return;
    for (const r of rows) {
      try {
        // Try to find userId from card -> createdBy
        let userId = null;
        const card = await MaterialCard.findByPk(r.cardId);
        if (card && card.createdBy) userId = card.createdBy;
        const buf = await downloadUrlToBuffer(r.fileUrl);
        const ext = path.extname(new URL(r.fileUrl).pathname) || '.bin';
        const key = userId ? `documents/${userId}/${randomUUID()}${ext}` : `documents/migrated/${randomUUID()}${ext}`;
        await storage.uploadFile(buf, key, r.fileType || null);
        const newUrl = await storage.getFileUrl(key);
        await r.update({ fileUrl: newUrl });
        console.log('Migrated material file', r.id, '->', newUrl);
      } catch (e) {
        console.error('Failed to migrate material file', r.id, e && e.message);
      }
    }
  }

  async function migrateDocumentsAndLinks() {
    const { Document, Link } = models;
    const docs = await Document.findAll({ where: { url: sequelize.literal(`url LIKE '%supabase.co%'`) } });
    console.log('Found %d documents to migrate', docs.length);
    if (doConfirm) {
      for (const d of docs) {
        try {
          const buf = await downloadUrlToBuffer(d.url);
          const ext = path.extname(new URL(d.url).pathname) || '.bin';
          const key = `documents/migrated/${randomUUID()}${ext}`;
          await storage.uploadFile(buf, key, null);
          const newUrl = await storage.getFileUrl(key);
          await d.update({ url: newUrl });
          console.log('Migrated document', d.elementId, '->', newUrl);
        } catch (e) {
          console.error('Failed to migrate document', d.elementId, e && e.message);
        }
      }
    }

    const links = await Link.findAll({ where: { url: sequelize.literal(`url LIKE '%supabase.co%' OR "previewImageUrl" LIKE '%supabase.co%'`) } });
    console.log('Found %d links to inspect for migration', links.length);
    if (doConfirm) {
      for (const l of links) {
        try {
          if (looksLikeSupabase(l.url)) {
            const buf = await downloadUrlToBuffer(l.url);
            const ext = path.extname(new URL(l.url).pathname) || '.bin';
            const key = `documents/migrated/${randomUUID()}${ext}`;
            await storage.uploadFile(buf, key, null);
            const newUrl = await storage.getFileUrl(key);
            await l.update({ url: newUrl });
            console.log('Migrated link.url', l.id, '->', newUrl);
          }
          if (looksLikeSupabase(l.previewImageUrl)) {
            const buf = await downloadUrlToBuffer(l.previewImageUrl);
            const ext = path.extname(new URL(l.previewImageUrl).pathname) || '.bin';
            const key = `documents/migrated/${randomUUID()}${ext}`;
            await storage.uploadFile(buf, key, null);
            const newUrl = await storage.getFileUrl(key);
            await l.update({ previewImageUrl: newUrl });
            console.log('Migrated link.previewImageUrl', l.id, '->', newUrl);
          }
        } catch (e) {
          console.error('Failed to migrate link', l.id, e && e.message);
        }
      }
    }
  }

  // Dry-run list
  await migrateUsersAvatars();
  await migrateMaterialFiles();
  await migrateDocumentsAndLinks();

  console.log('Migration script finished. Run with --confirm to perform changes.');
}

main().catch((e) => {
  console.error('Migration failed', e && e.stack || e);
  process.exit(1);
});

