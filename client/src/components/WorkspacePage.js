import { useState, useRef } from 'react';
import { StickyNote, Image, Link2, FileText, MessageCircle, Heart, ThumbsUp, Smile, X } from 'lucide-react';

export function WorkspacePage() {
  const [notes, setNotes] = useState([]);
  const [comments, setComments] = useState([
    { id: '1', author: 'Анна', text: 'Отличная идея! 👍', timestamp: '10:30' },
    { id: '2', author: 'Иван', text: 'Давайте обсудим детали', timestamp: '11:15' },
  ]);
  const [newComment, setNewComment] = useState('');
  const [draggingNote, setDraggingNote] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const boardRef = useRef(null);

  const colors = ['#C6D8E8', '#E8C6D8', '#CDE8D8'];

  const addNote = (type) => {
    const newNote = {
      id: Date.now().toString(),
      type,
      content: type === 'note' ? 'Новая заметка' : type === 'link' ? 'https://example.com' : 'Контент',
      x: Math.random() * 400 + 100,
      y: Math.random() * 300 + 100,
      color: colors[notes.length % colors.length],
      reactions: [],
    };
    setNotes([...notes, newNote]);
  };

  const handleMouseDown = (e, noteId) => {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    setDraggingNote(noteId);
    setDragOffset({
      x: e.clientX - note.x,
      y: e.clientY - note.y,
    });
  };

  const handleMouseMove = (e) => {
    if (!draggingNote) return;

    setNotes(
      notes.map((note) =>
        note.id === draggingNote
          ? { ...note, x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y }
          : note
      )
    );
  };

  const handleMouseUp = () => {
    setDraggingNote(null);
  };

  const addReaction = (noteId, emoji) => {
    setNotes(
      notes.map((note) => {
        if (note.id !== noteId) return note;

        const existingReaction = note.reactions.find((r) => r.emoji === emoji);
        if (existingReaction) {
          return {
            ...note,
            reactions: note.reactions.map((r) =>
              r.emoji === emoji ? { ...r, count: r.count + 1 } : r
            ),
          };
        } else {
          return {
            ...note,
            reactions: [...note.reactions, { emoji, count: 1 }],
          };
        }
      })
    );
  };

  const deleteNote = (noteId) => {
    setNotes(notes.filter((note) => note.id !== noteId));
  };

  const handleAddComment = () => {
    if (!newComment.trim()) return;
    
    const comment = {
      id: Date.now().toString(),
      author: 'Вы',
      text: newComment,
      timestamp: new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
    };
    setComments([...comments, comment]);
    setNewComment('');
  };

  return (
    <div className="flex h-[calc(100vh-73px)]">
      {/* Toolbar */}
      <div className="w-48 bg-white border-r border-gray-200 p-4">
        <h4 className="mb-4">Инструменты</h4>
        <div className="space-y-2">
          <button
            onClick={() => addNote('note')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#C6D8E8]/20 hover:bg-[#C6D8E8]/40 transition-colors text-left"
          >
            <StickyNote size={20} />
            <span>Заметка</span>
          </button>
          <button
            onClick={() => addNote('file')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#E8C6D8]/20 hover:bg-[#E8C6D8]/40 transition-colors text-left"
          >
            <FileText size={20} />
            <span>Файл</span>
          </button>
          <button
            onClick={() => addNote('image')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#CDE8D8]/20 hover:bg-[#CDE8D8]/40 transition-colors text-left"
          >
            <Image size={20} />
            <span>Изображение</span>
          </button>
          <button
            onClick={() => addNote('link')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-[#C6D8E8]/20 hover:bg-[#C6D8E8]/40 transition-colors text-left"
          >
            <Link2 size={20} />
            <span>Ссылка</span>
          </button>
        </div>
      </div>

      {/* Board */}
      <div
        ref={boardRef}
        className="flex-1 bg-[#F7F8FA] overflow-hidden relative"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {notes.map((note) => (
          <div
            key={note.id}
            className="absolute group"
            style={{ left: note.x, top: note.y }}
          >
            <div
              className="w-64 p-4 rounded-xl shadow-md hover:shadow-lg transition-all cursor-move"
              style={{ backgroundColor: note.color }}
              onMouseDown={(e) => handleMouseDown(e, note.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {note.type === 'note' && <StickyNote size={16} className="text-[#2E2E2E]" />}
                  {note.type === 'file' && <FileText size={16} className="text-[#2E2E2E]" />}
                  {note.type === 'image' && <Image size={16} className="text-[#2E2E2E]" />}
                  {note.type === 'link' && <Link2 size={16} className="text-[#2E2E2E]" />}
                </div>
                <button
                  onClick={() => deleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/50 rounded p-1"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="text-[#2E2E2E] mb-3">{note.content}</p>
              
              {/* Reactions */}
              <div className="flex items-center gap-2 flex-wrap">
                {note.reactions.map((reaction) => (
                  <span
                    key={reaction.emoji}
                    className="px-2 py-1 rounded-lg bg-white/50 text-xs"
                  >
                    {reaction.emoji} {reaction.count}
                  </span>
                ))}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={() => addReaction(note.id, '😀')}
                    className="px-2 py-1 rounded-lg bg-white/70 hover:bg-white text-xs"
                  >
                    😀
                  </button>
                  <button
                    onClick={() => addReaction(note.id, '❤️')}
                    className="px-2 py-1 rounded-lg bg-white/70 hover:bg-white text-xs"
                  >
                    ❤️
                  </button>
                  <button
                    onClick={() => addReaction(note.id, '👍')}
                    className="px-2 py-1 rounded-lg bg-white/70 hover:bg-white text-xs"
                  >
                    👍
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Comments Sidebar */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} />
            <h4>Комментарии</h4>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {comments.map((comment) => (
            <div key={comment.id} className="p-3 rounded-lg bg-[#F7F8FA]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">{comment.author}</span>
                <span className="text-xs text-[#7A7A7A]">{comment.timestamp}</span>
              </div>
              <p className="text-sm">{comment.text}</p>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddComment()}
              placeholder="Написать комментарий..."
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 focus:border-[#C6D8E8] focus:outline-none focus:ring-2 focus:ring-[#C6D8E8]/20"
            />
            <button
              onClick={handleAddComment}
              className="px-4 py-2 rounded-lg bg-[#C6D8E8] hover:bg-[#C6D8E8]/80 transition-colors"
            >
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
