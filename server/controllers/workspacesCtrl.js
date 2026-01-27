const { Op } = require('sequelize');
const sequelize = require('../db');
const { Desk, DeskRecent, DeskFavorite, Group, Project, Element, Note, Text, Document, Link, Drawing, Connector } = require('../models/models');
const { canReadDesk, canManageDesk } = require('../utils/deskAccess');

class WorkspacesController {
    async create(req, res) {
        try {
            const { name, description, type } = req.body || {};
            const userId = req.user?.id;
            
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            
            const desk = await Desk.create({ name, description, userId, type });
            return res.status(201).json(desk);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getAll(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            // Personal desks only. Group desks are fetched via /api/groups/:id/desks.
            const desks = await Desk.findAll({ where: { userId, groupId: null }, include: [{ model: Project }] });
            return res.json(desks);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getOne(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            const desk = await Desk.findByPk(id);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canReadDesk(desk, userId);
            if (!ok) return res.status(404).json({ error: 'Workspace not found' });

            // Track "recently opened" desks for the current user (HomePage -> Последние доски).
            // Best-effort: do not fail the request if tracking fails.
            try {
                await DeskRecent.upsert({
                    userId,
                    deskId: desk.deskId,
                    lastOpenedAt: new Date(),
                });
            } catch {
                // ignore
            }
            
            return res.json(desk);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async getRecent(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            const rows = await DeskRecent.findAll({
                where: { userId },
                include: [
                    {
                        model: Desk,
                        include: [{ model: Group }, { model: Project }],
                    },
                ],
                order: [['lastOpenedAt', 'DESC']],
                limit: 50,
            });

            const out = rows
                .map((r) => {
                    const desk = r?.desk;
                    if (!desk) return null;
                    return {
                        ...desk.toJSON(),
                        lastOpenedAt: r.lastOpenedAt,
                        group: desk.group ? desk.group.toJSON() : null,
                        project: desk.project ? desk.project.toJSON() : null,
                    };
                })
                .filter(Boolean);

            return res.json(out);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, description, type, projectId } = req.body;
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            const desk = await Desk.findByPk(id);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canManageDesk(desk, userId);
            if (!ok) return res.status(403).json({ error: 'Forbidden' });
            
            if (name !== undefined) desk.name = name;
            if (description !== undefined) desk.description = description;
            if (type !== undefined) desk.type = type;
            if (projectId !== undefined) {
                const pid = projectId === null ? null : Number(projectId);
                if (pid == null) {
                    desk.projectId = null;
                } else if (!Number.isFinite(pid) || pid <= 0) {
                    return res.status(400).json({ error: 'Invalid projectId' });
                } else {
                    const p = await Project.findOne({ where: { projectId: pid, userId } });
                    if (!p) return res.status(404).json({ error: 'Project not found' });
                    desk.projectId = pid;
                }
            }
            
            await desk.save();
            return res.json(desk);
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    async listFavorites(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authorized' });

            const rows = await DeskFavorite.findAll({
                where: { userId },
                include: [
                    {
                        model: Desk,
                        include: [{ model: Group }, { model: Project }],
                    },
                ],
                order: [['createdAt', 'DESC']],
                limit: 200,
            });

            const out = rows
                .map((r) => r?.desk)
                .filter(Boolean)
                .map((d) => ({
                    ...d.toJSON(),
                    group: d.group ? d.group.toJSON() : null,
                    project: d.project ? d.project.toJSON() : null,
                }));

            return res.json(out);
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    async toggleFavorite(req, res) {
        try {
            const userId = req.user?.id;
            if (!userId) return res.status(401).json({ error: 'Not authorized' });
            const deskId = Number(req.params.id);
            if (!deskId) return res.status(400).json({ error: 'Invalid id' });

            const desk = await Desk.findByPk(deskId);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canReadDesk(desk, userId);
            if (!ok) return res.status(404).json({ error: 'Workspace not found' });

            const existing = await DeskFavorite.findOne({ where: { userId, deskId } });
            if (existing) {
                await existing.destroy();
                return res.json({ favorite: false });
            }
            await DeskFavorite.create({ userId, deskId });
            return res.json({ favorite: true });
        } catch (e) {
            return res.status(500).json({ error: e.message });
        }
    }

    async duplicate(req, res) {
        const t = await sequelize.transaction();
        try {
            const userId = req.user?.id;
            if (!userId) {
                await t.rollback();
                return res.status(401).json({ error: 'Not authorized' });
            }

            const srcId = Number(req.params.id);
            if (!srcId) {
                await t.rollback();
                return res.status(400).json({ error: 'Invalid id' });
            }

            const src = await Desk.findByPk(srcId, { transaction: t });
            if (!src) {
                await t.rollback();
                return res.status(404).json({ error: 'Workspace not found' });
            }
            const canRead = await canReadDesk(src, userId);
            if (!canRead) {
                await t.rollback();
                return res.status(404).json({ error: 'Workspace not found' });
            }

            // Copy into the same scope if user can manage it; otherwise copy to personal space.
            const canManage = await canManageDesk(src, userId);
            const target = await Desk.create(
                {
                    name: `${src.name} (копия)`,
                    description: src.description,
                    type: src.type,
                    userId,
                    groupId: canManage ? src.groupId : null,
                    projectId: null,
                },
                { transaction: t }
            );

            const srcElements = await Element.findAll({
                where: { deskId: src.deskId },
                order: [['elementId', 'ASC']],
                transaction: t,
            });

            const idMap = new Map(); // old elementId -> new elementId
            for (const el of srcElements) {
                // eslint-disable-next-line no-await-in-loop
                const created = await Element.create(
                    {
                        type: el.type,
                        x: el.x,
                        y: el.y,
                        width: el.width,
                        height: el.height,
                        rotation: el.rotation,
                        zIndex: el.zIndex,
                        reactions: el.reactions || {},
                        deskId: target.deskId,
                    },
                    { transaction: t }
                );
                idMap.set(el.elementId, created.elementId);
            }

            // Copy per-type payloads
            for (const el of srcElements) {
                const newElementId = idMap.get(el.elementId);
                if (!newElementId) continue;

                // eslint-disable-next-line default-case
                switch (el.type) {
                    case 'note': {
                        // eslint-disable-next-line no-await-in-loop
                        const row = await Note.findByPk(el.elementId, { transaction: t });
                        // eslint-disable-next-line no-await-in-loop
                        await Note.create({ elementId: newElementId, text: row?.text || '' }, { transaction: t });
                        break;
                    }
                    case 'text': {
                        // eslint-disable-next-line no-await-in-loop
                        const row = await Text.findByPk(el.elementId, { transaction: t });
                        // eslint-disable-next-line no-await-in-loop
                        await Text.create(
                            {
                                elementId: newElementId,
                                content: row?.content || '',
                                fontFamily: row?.fontFamily || null,
                                fontSize: row?.fontSize || null,
                                color: row?.color || null,
                            },
                            { transaction: t }
                        );
                        break;
                    }
                    case 'document': {
                        // eslint-disable-next-line no-await-in-loop
                        const row = await Document.findByPk(el.elementId, { transaction: t });
                        // eslint-disable-next-line no-await-in-loop
                        await Document.create(
                            {
                                elementId: newElementId,
                                title: row?.title || null,
                                url: row?.url || '',
                            },
                            { transaction: t }
                        );
                        break;
                    }
                    case 'link': {
                        // eslint-disable-next-line no-await-in-loop
                        const row = await Link.findByPk(el.elementId, { transaction: t });
                        // eslint-disable-next-line no-await-in-loop
                        await Link.create(
                            {
                                elementId: newElementId,
                                title: row?.title || null,
                                url: row?.url || '',
                                previewImageUrl: row?.previewImageUrl || null,
                            },
                            { transaction: t }
                        );
                        break;
                    }
                    case 'drawing': {
                        // eslint-disable-next-line no-await-in-loop
                        const row = await Drawing.findByPk(el.elementId, { transaction: t });
                        // eslint-disable-next-line no-await-in-loop
                        await Drawing.create({ elementId: newElementId, data: row?.data || {} }, { transaction: t });
                        break;
                    }
                    case 'connector': {
                        // eslint-disable-next-line no-await-in-loop
                        const row = await Connector.findByPk(el.elementId, { transaction: t });
                        // eslint-disable-next-line no-await-in-loop
                        await Connector.create({ elementId: newElementId, data: row?.data || {} }, { transaction: t });
                        break;
                    }
                }
            }

            await t.commit();
            return res.status(201).json(target);
        } catch (e) {
            await t.rollback();
            return res.status(500).json({ error: e.message });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const userId = req.user?.id;
            if (!userId) {
                return res.status(401).json({ error: 'Not authorized' });
            }

            const desk = await Desk.findByPk(id);
            if (!desk) return res.status(404).json({ error: 'Workspace not found' });
            const ok = await canManageDesk(desk, userId);
            if (!ok) return res.status(403).json({ error: 'Forbidden' });
            
            await desk.destroy();
            return res.json({ message: 'Workspace deleted successfully' });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }
}

module.exports = new WorkspacesController();

