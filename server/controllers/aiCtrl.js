const { Desk, Element, Note, Text, Link, Document } = require('../models/models');
const { canReadDesk } = require('../utils/deskAccess');

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function safeTrim(s, maxChars) {
  const str = String(s ?? '');
  if (!Number.isFinite(maxChars) || maxChars <= 0) return str;
  if (str.length <= maxChars) return str;
  return `${str.slice(0, maxChars)}\n\n[...content truncated to ${maxChars} chars...]`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const out = [];
  for (const m of history) {
    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    const content = String(m?.content ?? '').trim();
    if (!content) continue;
    out.push({ role, content });
  }
  // Keep last N turns to avoid huge prompts.
  return out.slice(-24);
}

function extractDeskContext(elements) {
  const lines = [];
  const counts = { note: 0, text: 0, link: 0, document: 0, drawing: 0, other: 0 };

  for (const el of elements || []) {
    const type = String(el?.type || '').toLowerCase();
    if (!counts[type]) counts.other += 1;
    else counts[type] += 1;

    const meta = `#${el?.elementId ?? el?.id ?? '?'}`;
    if (type === 'note') {
      const text = String(el?.note?.text ?? el?.Note?.text ?? '').trim();
      if (text) lines.push(`[note ${meta}] ${text}`);
      continue;
    }
    if (type === 'text') {
      const text = String(el?.text?.content ?? el?.Text?.content ?? '').trim();
      if (text) lines.push(`[text ${meta}] ${text}`);
      continue;
    }
    if (type === 'link') {
      const title = String(el?.link?.title ?? el?.Link?.title ?? '').trim();
      const url = String(el?.link?.url ?? el?.Link?.url ?? '').trim();
      const display = [title, url].filter(Boolean).join(' — ');
      if (display) lines.push(`[link ${meta}] ${display}`);
      continue;
    }
    if (type === 'document') {
      const title = String(el?.document?.title ?? el?.Document?.title ?? '').trim();
      const url = String(el?.document?.url ?? el?.Document?.url ?? '').trim();
      const display = [title, url].filter(Boolean).join(' — ');
      if (display) lines.push(`[document ${meta}] ${display}`);
      continue;
    }
    // Drawing content is usually non-text; ignore details for now.
  }

  const header = `Elements: notes=${counts.note}, text=${counts.text}, links=${counts.link}, documents=${counts.document}, drawings=${counts.drawing}`;
  return `${header}\n${lines.join('\n')}`.trim();
}

async function loadDeskForAi({ deskId, userId }) {
  const desk = await Desk.findByPk(deskId);
  if (!desk) return { desk: null, elements: null, error: { status: 404, body: { error: 'Workspace not found' } } };

  const ok = await canReadDesk(desk, userId);
  if (!ok) return { desk: null, elements: null, error: { status: 404, body: { error: 'Workspace not found' } } };

  const elements = await Element.findAll({
    where: { deskId },
    include: [
      { model: Note, required: false },
      { model: Text, required: false },
      { model: Link, required: false },
      { model: Document, required: false },
    ],
    order: [['zIndex', 'ASC'], ['elementId', 'ASC']],
  });

  return { desk, elements, error: null };
}

async function ollamaChat({ host, model, messages }) {
  if (typeof fetch !== 'function') {
    const err = new Error('Ollama client requires global fetch (Node 18+).');
    err.code = 'NO_FETCH';
    throw err;
  }
  const url = new URL('/api/chat', host).toString();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || `Ollama error (${res.status})`;
    const err = new Error(msg);
    err.code = 'OLLAMA_HTTP';
    err.httpStatus = res.status;
    err.data = data;
    throw err;
  }
  return String(data?.message?.content ?? '').trim();
}

class AiController {
  async status(req, res) {
    const provider = String(process.env.AI_PROVIDER || 'disabled').toLowerCase();
    const enabled = provider !== 'disabled' && provider !== 'none' && provider !== '';
    const model = provider === 'ollama' ? process.env.AI_OLLAMA_MODEL || 'llama3.2:3b' : null;
    return res.json({ enabled, provider: enabled ? provider : null, model });
  }

  // Placeholder for future AI: summarize a desk content for the user.
  // Currently returns 501 unless AI_PROVIDER is configured.
  async summarizeDesk(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });
      const deskId = toInt(req.params.deskId);
      if (!deskId) return res.status(400).json({ error: 'Invalid deskId' });

      const loaded = await loadDeskForAi({ deskId, userId });
      if (loaded.error) return res.status(loaded.error.status).json(loaded.error.body);
      const { elements } = loaded;

      const provider = String(process.env.AI_PROVIDER || 'disabled').toLowerCase();
      if (!process.env.AI_PROVIDER || provider === 'disabled' || provider === 'none') {
        return res.status(501).json({
          error: 'AI is not configured',
          hint: 'Set AI_PROVIDER=ollama to enable local LLM (Ollama at http://localhost:11434)',
          sampleInput: {
            deskId,
            elements: elements.length,
          },
        });
      }

      // Minimal mock to prove wiring works.
      if (provider === 'mock') {
        return res.json({
          deskId,
          summary: `Mock summary: ${elements.length} elements on this board.`,
          provider: 'mock',
        });
      }

      if (provider === 'ollama') {
        const host = process.env.AI_OLLAMA_HOST || 'http://localhost:11434';
        const model = process.env.AI_OLLAMA_MODEL || 'llama3.2:3b';
        const maxContextChars = Number(process.env.AI_CONTEXT_CHARS || 12000);
        const ctx = safeTrim(extractDeskContext(elements), maxContextChars);

        const messages = [
          {
            role: 'system',
            content:
              'Ты ИИ-помощник Healis. Твоя задача — помогать студенту по контенту доски (whiteboard). ' +
              'Ниже дан текстовый слепок элементов доски. Отвечай по-русски, кратко и структурировано. ' +
              'Если информации недостаточно — задай уточняющие вопросы.',
          },
          {
            role: 'user',
            content:
              `Суммаризируй контент доски. Выдели:\n` +
              `1) краткое резюме (3-7 пунктов)\n` +
              `2) ключевые темы/термины\n` +
              `3) список "что осталось непонятно/что уточнить"\n\n` +
              `Контент доски:\n${ctx}`,
          },
        ];

        try {
          const summary = await ollamaChat({ host, model, messages });
          return res.json({ deskId, summary, provider: 'ollama', model });
        } catch (e) {
          const msg = String(e?.message || 'Ollama request failed');
          const hint =
            msg.toLowerCase().includes('connect') || msg.toLowerCase().includes('refused')
              ? 'Запусти Ollama и убедись, что он доступен на http://localhost:11434 и модель скачана: `ollama pull llama3.2:3b`'
              : null;
          return res.status(503).json({ error: msg, provider: 'ollama', model, hint });
        }
      }

      return res.status(501).json({ error: 'AI provider wiring not implemented yet', provider });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async chatDesk(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });
      const deskId = toInt(req.params.deskId);
      if (!deskId) return res.status(400).json({ error: 'Invalid deskId' });

      const text = String(req.body?.message ?? '').trim();
      const history = normalizeHistory(req.body?.history);
      if (!text) return res.status(400).json({ error: 'Message is required' });

      const loaded = await loadDeskForAi({ deskId, userId });
      if (loaded.error) return res.status(loaded.error.status).json(loaded.error.body);
      const { desk, elements } = loaded;

      const provider = String(process.env.AI_PROVIDER || 'disabled').toLowerCase();
      if (!process.env.AI_PROVIDER || provider === 'disabled' || provider === 'none') {
        return res.status(501).json({
          error: 'AI is not configured',
          hint: 'Set AI_PROVIDER=ollama to enable local LLM (Ollama at http://localhost:11434)',
        });
      }

      if (provider === 'mock') {
        const ctx = extractDeskContext(elements);
        return res.json({
          deskId,
          reply: `Mock reply. I see ${elements.length} elements. Your message: "${text}".\n\nContext sample:\n${safeTrim(ctx, 500)}`,
          provider: 'mock',
        });
      }

      if (provider === 'ollama') {
        const host = process.env.AI_OLLAMA_HOST || 'http://localhost:11434';
        const model = process.env.AI_OLLAMA_MODEL || 'llama3.2:3b';
        const maxContextChars = Number(process.env.AI_CONTEXT_CHARS || 12000);
        const ctx = safeTrim(extractDeskContext(elements), maxContextChars);

        const messages = [
          {
            role: 'system',
            content:
              'Ты ИИ-помощник Healis для студентов Сеченовского университета. ' +
              'Ты видишь контент доски как текстовый слепок. Используй его для ответов: объясняй, суммаризируй, ' +
              'предлагай структуру конспекта, задавай уточняющие вопросы. Отвечай по-русски. ' +
              'Не выдумывай факты — если чего-то нет на доске, скажи, что не видишь этого в контенте.',
          },
          {
            role: 'system',
            content: `Рабочая область: "${String(desk?.name ?? 'Workspace')}".\nКонтент доски:\n${ctx}`,
          },
          ...history,
          { role: 'user', content: text },
        ];

        try {
          const reply = await ollamaChat({ host, model, messages });
          return res.json({ deskId, reply, provider: 'ollama', model });
        } catch (e) {
          const msg = String(e?.message || 'Ollama request failed');
          const hint =
            msg.toLowerCase().includes('connect') || msg.toLowerCase().includes('refused')
              ? 'Запусти Ollama и убедись, что он доступен на http://localhost:11434 и модель скачана: `ollama pull llama3.2:3b`'
              : null;
          return res.status(503).json({ error: msg, provider: 'ollama', model, hint });
        }
      }

      return res.status(501).json({ error: 'AI provider wiring not implemented yet', provider });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AiController();


