import {
  Eraser,
  Frame,
  Hand,
  Link2,
  MousePointer2,
  Paperclip,
  PenLine,
  Square,
  Spline,
  Type,
  BookMarked,
} from 'lucide-react';

export const BRUSH_COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ffffff'];

export const QUICK_REACTIONS = ['😍', '😢', '😁', '🤣', '😌', '😎'];

export const AI_PROMPT_SUGGESTIONS = [
  { label: 'Суммаризация', prompt: 'Сделай краткую суммаризацию контента доски и выдели ключевые темы.' },
  { label: 'Задачи', prompt: 'Предложи actionable список задач по содержимому доски. Коротко, по пунктам.' },
  { label: 'План', prompt: 'Составь пошаговый план действий на основе содержимого доски.' },
  { label: 'Идеи', prompt: 'Предложи 5 идей/улучшений по содержимому доски.' },
];

export const TOOLS = [
  { id: 'select', label: 'Select', Icon: MousePointer2, hotspot: [2, 2], fallbackCursor: 'default' },
  { id: 'hand', label: 'Hand', Icon: Hand, hotspot: [12, 12], fallbackCursor: 'grab' },
  { id: 'connector', label: 'Соединительные линии', Icon: Spline, hotspot: [4, 4], fallbackCursor: 'crosshair' },
  { id: 'frame', label: 'Frame', Icon: Frame, hotspot: [12, 12], fallbackCursor: 'crosshair' },
  { id: 'note', label: 'Note', Icon: Square, hotspot: [12, 12], fallbackCursor: 'copy' },
  { id: 'text', label: 'Text', Icon: Type, hotspot: [8, 18], fallbackCursor: 'text' },
  { id: 'material_block', label: 'Блок материалов', Icon: BookMarked, hotspot: [2, 2], fallbackCursor: 'pointer' },
  { id: 'pen', label: 'Pen', Icon: PenLine, hotspot: [2, 20], fallbackCursor: 'crosshair' },
  { id: 'eraser', label: 'Eraser', Icon: Eraser, hotspot: [2, 20], fallbackCursor: 'crosshair' },
  { id: 'attach', label: 'Attach file', Icon: Paperclip, hotspot: [2, 2], fallbackCursor: 'pointer' },
  { id: 'link', label: 'Link', Icon: Link2, hotspot: [2, 2], fallbackCursor: 'pointer' },
];
