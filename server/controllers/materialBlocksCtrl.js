const path = require('path');
const { Op } = require('sequelize');
const {
  Desk,
  MaterialBlock,
  MaterialCard,
  MaterialFile,
  MaterialLink,
  MaterialCardTag,
  User,
} = require('../models/models');
const { canReadDesk, canManageDesk } = require('../utils/deskAccess');

const DEFAULT_BLOCK_WIDTH = 280;
const DEFAULT_BLOCK_HEIGHT = 160;
const CARDS_PAGE_SIZE = 20;

function fixMojibakeName(name) {
  const s = String(name || '');
  const looksMojibake = /[ÐÑ]/.test(s) && !/[А-Яа-яЁё]/.test(s);
  if (!looksMojibake) return s.normalize('NFC');
  try {
    return Buffer.from(s, 'latin1').toString('utf8').normalize('NFC');
  } catch {
    return s.normalize('NFC');
  }
}

async function getBlockWithDesk(blockId, userId) {
  const block = await MaterialBlock.findByPk(blockId);
  if (!block) return { block: null, desk: null };
  const desk = await Desk.findByPk(block.boardId);
  if (!desk) return { block, desk: null };
  const canRead = await canReadDesk(desk, userId);
  if (!canRead) return { block, desk: null };
  return { block, desk };
}

async function getDeskForCard(cardId, userId) {
  const card = await MaterialCard.findByPk(cardId);
  if (!card) return null;
  const block = await MaterialBlock.findByPk(card.blockId);
  if (!block) return null;
  const desk = await Desk.findByPk(block.boardId);
  if (!desk) return null;
  const canManage = await canManageDesk(desk, userId);
  return canManage ? desk : null;
}

class MaterialBlocksController {
  async listByDesk(req, res) {
    try {
      const { deskId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });
      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Workspace not found' });

      const blocks = await MaterialBlock.findAll({
        where: { boardId: deskId },
        order: [['id', 'ASC']],
        attributes: ['id', 'boardId', 'title', 'x', 'y', 'width', 'height', 'createdAt'],
      });

      const blocksWithCount = await Promise.all(
        blocks.map(async (b) => {
          const count = await MaterialCard.count({ where: { blockId: b.id } });
          return { ...b.toJSON(), cardsCount: count };
        })
      );

      return res.json(blocksWithCount);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const { deskId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      const { title = 'Материалы', x = 0, y = 0, width = DEFAULT_BLOCK_WIDTH, height = DEFAULT_BLOCK_HEIGHT } = req.body || {};
      const block = await MaterialBlock.create({
        boardId: deskId,
        title: String(title).trim() || 'Материалы',
        x: Number(x) || 0,
        y: Number(y) || 0,
        width: Math.max(160, Math.min(600, Number(width) || DEFAULT_BLOCK_WIDTH)),
        height: Math.max(120, Math.min(400, Number(height) || DEFAULT_BLOCK_HEIGHT)),
      });
      const count = await MaterialCard.count({ where: { blockId: block.id } });
      return res.status(201).json({ ...block.toJSON(), cardsCount: count });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getOne(req, res) {
    try {
      const { blockId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const { block, desk } = await getBlockWithDesk(blockId, userId);
      if (!block || !desk) return res.status(404).json({ error: 'Block not found' });
      const count = await MaterialCard.count({ where: { blockId: block.id } });
      return res.json({ ...block.toJSON(), cardsCount: count });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async update(req, res) {
    try {
      const blockIdRaw = req.params.blockId;
      const blockId = typeof blockIdRaw === 'string' ? parseInt(blockIdRaw, 10) : blockIdRaw;
      if (Number.isNaN(blockId)) return res.status(400).json({ error: 'Invalid block id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const { block, desk } = await getBlockWithDesk(blockId, userId);
      if (!block || !desk) return res.status(404).json({ error: 'Block not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      const { title, x, y, width, height } = req.body || {};
      const updates = {};
      if (title !== undefined) updates.title = String(title).trim() || block.title;
      if (x !== undefined) {
        const v = Number(x);
        updates.x = Number.isFinite(v) ? v : block.x;
      }
      if (y !== undefined) {
        const v = Number(y);
        updates.y = Number.isFinite(v) ? v : block.y;
      }
      const safeW = block.width ?? DEFAULT_BLOCK_WIDTH;
      const safeH = block.height ?? DEFAULT_BLOCK_HEIGHT;
      if (width !== undefined) {
        const v = Number(width);
        updates.width = Math.max(160, Math.min(600, Number.isFinite(v) ? v : safeW));
      }
      if (height !== undefined) {
        const v = Number(height);
        updates.height = Math.max(120, Math.min(400, Number.isFinite(v) ? v : safeH));
      }
      if (Object.keys(updates).length) await block.update(updates);
      const count = await MaterialCard.count({ where: { blockId: block.id } });
      return res.json({ ...block.toJSON(), cardsCount: count });
    } catch (error) {
      console.error('MaterialBlocksCtrl.update', error);
      return res.status(500).json({ error: error.message || 'Update failed' });
    }
  }

  async delete(req, res) {
    try {
      const { blockId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const { block, desk } = await getBlockWithDesk(blockId, userId);
      if (!block || !desk) return res.status(404).json({ error: 'Block not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      await block.destroy();
      return res.json({ message: 'Block deleted' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getCards(req, res) {
    try {
      const blockIdRaw = req.params.blockId;
      const blockId = typeof blockIdRaw === 'string' ? parseInt(blockIdRaw, 10) : blockIdRaw;
      if (Number.isNaN(blockId)) return res.status(400).json({ error: 'Invalid block id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const { block, desk } = await getBlockWithDesk(blockId, userId);
      if (!block || !desk) return res.status(404).json({ error: 'Block not found' });

      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || CARDS_PAGE_SIZE));
      const search = String(req.query.search || '').trim();
      const sortRaw = String(req.query.sort || 'updatedAt:desc');
      const [sortField, sortDir] = sortRaw.split(':');
      const orderField = ['title', 'createdAt', 'updatedAt'].includes(sortField) ? sortField : 'updatedAt';
      const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';

      const where = { blockId: block.id };
      if (search) {
        where[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { content: { [Op.iLike]: `%${search}%` } },
        ];
      }

      const { count, rows } = await MaterialCard.findAndCountAll({
        where,
        include: [
          { model: User, as: 'user', attributes: ['id', 'nickname', 'username'], required: false },
          { model: MaterialFile, as: 'material_files', attributes: ['id', 'fileUrl', 'fileType', 'size'], required: false },
          { model: MaterialLink, as: 'material_links', attributes: ['id', 'url', 'title'], required: false },
          { model: MaterialCardTag, as: 'material_card_tags', attributes: ['id', 'tag'], required: false },
        ],
        order: [[orderField, orderDir]],
        limit,
        offset: (page - 1) * limit,
      });

      const cards = rows.map((c) => {
        const j = c.toJSON();
        j.created_by = j.user ? { id: j.user.id, nickname: j.user.nickname, username: j.user.username } : null;
        j.attachments = (j.material_files || []).map((f) => ({ id: f.id, file_url: f.fileUrl, file_type: f.fileType, size: f.size }));
        j.links = (j.material_links || []).map((l) => ({ id: l.id, url: l.url, title: l.title }));
        j.tags = (j.material_card_tags || []).map((t) => t.tag);
        delete j.user;
        delete j.material_files;
        delete j.material_links;
        delete j.material_card_tags;
        return j;
      });

      return res.json({
        cards,
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit),
      });
    } catch (error) {
      console.error('MaterialBlocksCtrl.getCards', error);
      return res.status(500).json({ error: error.message || 'Failed to load cards' });
    }
  }

  async createCard(req, res) {
    try {
      const blockIdRaw = req.params.blockId;
      const blockId = typeof blockIdRaw === 'string' ? parseInt(blockIdRaw, 10) : blockIdRaw;
      if (Number.isNaN(blockId)) return res.status(400).json({ error: 'Invalid block id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const { block, desk } = await getBlockWithDesk(blockId, userId);
      if (!block || !desk) return res.status(404).json({ error: 'Block not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      const { title = '', content = '' } = req.body || {};
      const card = await MaterialCard.create({
        blockId: block.id,
        title: String(title).trim() || 'Без названия',
        content: String(content).trim() || '',
        createdBy: userId,
      });
      const full = await MaterialCard.findByPk(card.id, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'nickname', 'username'], required: false },
          { model: MaterialFile, as: 'material_files', attributes: ['id', 'fileUrl', 'fileType', 'size'], required: false },
          { model: MaterialLink, as: 'material_links', attributes: ['id', 'url', 'title'], required: false },
          { model: MaterialCardTag, as: 'material_card_tags', attributes: ['id', 'tag'], required: false },
        ],
      });
      const j = full.toJSON();
      j.created_by = j.user ? { id: j.user.id, nickname: j.user.nickname, username: j.user.username } : null;
      j.attachments = (j.material_files || []).map((f) => ({ id: f.id, file_url: f.fileUrl, file_type: f.fileType, size: f.size }));
      j.links = (j.material_links || []).map((l) => ({ id: l.id, url: l.url, title: l.title }));
      j.tags = (j.material_card_tags || []).map((t) => t.tag);
      delete j.user;
      delete j.material_files;
      delete j.material_links;
      delete j.material_card_tags;
      return res.status(201).json(j);
    } catch (error) {
      console.error('MaterialBlocksCtrl.createCard', error);
      return res.status(500).json({ error: error.message || 'Create card failed' });
    }
  }

  async getCard(req, res) {
    try {
      const { cardId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const card = await MaterialCard.findByPk(cardId, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'nickname', 'username'], required: false },
          { model: MaterialFile, as: 'material_files', attributes: ['id', 'fileUrl', 'fileType', 'size'], required: false },
          { model: MaterialLink, as: 'material_links', attributes: ['id', 'url', 'title'], required: false },
          { model: MaterialCardTag, as: 'material_card_tags', attributes: ['id', 'tag'], required: false },
        ],
      });
      if (!card) return res.status(404).json({ error: 'Card not found' });
      const block = await MaterialBlock.findByPk(card.blockId);
      if (!block) return res.status(404).json({ error: 'Card not found' });
      const desk = await Desk.findByPk(block.boardId);
      if (!desk) return res.status(404).json({ error: 'Card not found' });
      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Card not found' });

      const j = card.toJSON();
      j.created_by = j.user ? { id: j.user.id, nickname: j.user.nickname, username: j.user.username } : null;
      j.attachments = (j.material_files || []).map((f) => ({ id: f.id, file_url: f.fileUrl, file_type: f.fileType, size: f.size }));
      j.links = (j.material_links || []).map((l) => ({ id: l.id, url: l.url, title: l.title }));
      j.tags = (j.material_card_tags || []).map((t) => t.tag);
      delete j.user;
      delete j.material_files;
      delete j.material_links;
      delete j.material_card_tags;
      return res.json(j);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async updateCard(req, res) {
    try {
      const cardIdRaw = req.params.cardId;
      const cardId = typeof cardIdRaw === 'string' ? parseInt(cardIdRaw, 10) : cardIdRaw;
      if (Number.isNaN(cardId)) return res.status(400).json({ error: 'Invalid card id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await getDeskForCard(cardId, userId);
      if (!desk) return res.status(404).json({ error: 'Card not found' });

      const card = await MaterialCard.findByPk(cardId);
      if (!card) return res.status(404).json({ error: 'Card not found' });

      const { title, content } = req.body || {};
      const updates = {};
      if (title !== undefined) updates.title = String(title).trim() || card.title;
      if (content !== undefined) updates.content = String(content);
      if (Object.keys(updates).length) await card.update(updates);

      const full = await MaterialCard.findByPk(card.id, {
        include: [
          { model: User, as: 'user', attributes: ['id', 'nickname', 'username'], required: false },
          { model: MaterialFile, as: 'material_files', attributes: ['id', 'fileUrl', 'fileType', 'size'], required: false },
          { model: MaterialLink, as: 'material_links', attributes: ['id', 'url', 'title'], required: false },
          { model: MaterialCardTag, as: 'material_card_tags', attributes: ['id', 'tag'], required: false },
        ],
      });
      const j = full.toJSON();
      j.created_by = j.user ? { id: j.user.id, nickname: j.user.nickname, username: j.user.username } : null;
      j.attachments = (j.material_files || []).map((f) => ({ id: f.id, file_url: f.fileUrl, file_type: f.fileType, size: f.size }));
      j.links = (j.material_links || []).map((l) => ({ id: l.id, url: l.url, title: l.title }));
      j.tags = (j.material_card_tags || []).map((t) => t.tag);
      delete j.user;
      delete j.material_files;
      delete j.material_links;
      delete j.material_card_tags;
      return res.json(j);
    } catch (error) {
      console.error('MaterialBlocksCtrl.updateCard', error);
      return res.status(500).json({ error: error.message || 'Update failed' });
    }
  }

  async deleteCard(req, res) {
    try {
      const cardIdRaw = req.params.cardId;
      const cardId = typeof cardIdRaw === 'string' ? parseInt(cardIdRaw, 10) : cardIdRaw;
      if (Number.isNaN(cardId)) return res.status(400).json({ error: 'Invalid card id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await getDeskForCard(cardId, userId);
      if (!desk) return res.status(404).json({ error: 'Card not found' });

      const card = await MaterialCard.findByPk(cardId);
      if (!card) return res.status(404).json({ error: 'Card not found' });

      await card.destroy();
      return res.json({ message: 'Card deleted' });
    } catch (error) {
      console.error('MaterialBlocksCtrl.deleteCard', error);
      return res.status(500).json({ error: error.message || 'Delete failed' });
    }
  }

  async uploadCardFile(req, res) {
    try {
      const cardIdRaw = req.params.cardId;
      const cardId = typeof cardIdRaw === 'string' ? parseInt(cardIdRaw, 10) : cardIdRaw;
      if (Number.isNaN(cardId)) return res.status(400).json({ error: 'Invalid card id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await getDeskForCard(cardId, userId);
      if (!desk) return res.status(404).json({ error: 'Card not found' });

      const card = await MaterialCard.findByPk(cardId);
      if (!card) return res.status(404).json({ error: 'Card not found' });

      const file = req.file;
      if (!file) return res.status(400).json({ error: 'No file provided' });

      const filename = file.filename || path.basename(file.path || '');
      const fileUrl = `/uploads/${userId}/card/${card.id}/${encodeURIComponent(filename)}`;
      const mf = await MaterialFile.create({
        cardId: card.id,
        fileUrl,
        fileType: file.mimetype || null,
        size: file.size || null,
      });
      return res.status(201).json({
        id: mf.id,
        file_url: mf.fileUrl,
        file_type: mf.fileType,
        size: mf.size,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async addCardLink(req, res) {
    try {
      const cardIdRaw = req.params.cardId;
      const cardId = typeof cardIdRaw === 'string' ? parseInt(cardIdRaw, 10) : cardIdRaw;
      if (Number.isNaN(cardId)) return res.status(400).json({ error: 'Invalid card id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await getDeskForCard(cardId, userId);
      if (!desk) return res.status(404).json({ error: 'Card not found' });

      const card = await MaterialCard.findByPk(cardId);
      if (!card) return res.status(404).json({ error: 'Card not found' });

      const { url, title } = req.body || {};
      if (!url || !String(url).trim()) return res.status(400).json({ error: 'url is required' });
      const link = await MaterialLink.create({
        cardId: card.id,
        url: String(url).trim(),
        title: title != null ? String(title).trim() : null,
      });
      return res.status(201).json({ id: link.id, url: link.url, title: link.title });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteCardLink(req, res) {
    try {
      const linkIdRaw = req.params.linkId;
      const linkId = typeof linkIdRaw === 'string' ? parseInt(linkIdRaw, 10) : linkIdRaw;
      if (Number.isNaN(linkId)) return res.status(400).json({ error: 'Invalid link id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const link = await MaterialLink.findByPk(linkId);
      if (!link) return res.status(404).json({ error: 'Link not found' });

      const desk = await getDeskForCard(link.cardId, userId);
      if (!desk) return res.status(404).json({ error: 'Link not found' });

      await link.destroy();
      return res.json({ message: 'Link deleted' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async deleteCardFile(req, res) {
    try {
      const fileIdRaw = req.params.fileId;
      const fileId = typeof fileIdRaw === 'string' ? parseInt(fileIdRaw, 10) : fileIdRaw;
      if (Number.isNaN(fileId)) return res.status(400).json({ error: 'Invalid file id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const mf = await MaterialFile.findByPk(fileId);
      if (!mf) return res.status(404).json({ error: 'File not found' });

      const desk = await getDeskForCard(mf.cardId, userId);
      if (!desk) return res.status(404).json({ error: 'File not found' });

      await mf.destroy();
      return res.json({ message: 'File deleted' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async setCardTags(req, res) {
    try {
      const cardIdRaw = req.params.cardId;
      const cardId = typeof cardIdRaw === 'string' ? parseInt(cardIdRaw, 10) : cardIdRaw;
      if (Number.isNaN(cardId)) return res.status(400).json({ error: 'Invalid card id' });

      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await getDeskForCard(cardId, userId);
      if (!desk) return res.status(404).json({ error: 'Card not found' });

      const card = await MaterialCard.findByPk(cardId);
      if (!card) return res.status(404).json({ error: 'Card not found' });

      const tags = Array.isArray(req.body?.tags) ? req.body.tags.map((t) => String(t).trim()).filter(Boolean) : [];
      await MaterialCardTag.destroy({ where: { cardId: card.id } });
      if (tags.length) {
        await MaterialCardTag.bulkCreate(tags.map((tag) => ({ cardId: card.id, tag })));
      }
      const updated = await MaterialCardTag.findAll({ where: { cardId: card.id }, attributes: ['tag'] });
      return res.json({ tags: updated.map((t) => t.tag) });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new MaterialBlocksController();
