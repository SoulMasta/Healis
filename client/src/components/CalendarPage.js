import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';

export function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 1)); // March 2026
  const [events, setEvents] = useState([
    { id: '1', title: 'Дизайн-ревью', date: '2026-03-15', type: 'meeting', color: '#C6D8E8' },
    { id: '2', title: 'Планирование спринта', date: '2026-03-18', type: 'task', color: '#E8C6D8' },
    { id: '3', title: 'Презентация проекта', date: '2026-03-20', type: 'meeting', color: '#CDE8D8' },
  ]);
  const [selectedTypes, setSelectedTypes] = useState({
    meeting: true,
    task: true,
    reminder: true,
  });

  const monthNames = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
  ];

  const weekDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const hasEvent = (day) => {
    const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return events.some(event => event.date === dateString && selectedTypes[event.type]);
  };

  const getEventColor = (day) => {
    const dateString = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const event = events.find(event => event.date === dateString && selectedTypes[event.type]);
    return event?.color || '#E8C6D8';
  };

  const isToday = (day) => {
    const today = new Date();
    return (
      day === today.getDate() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getFullYear() === today.getFullYear()
    );
  };

  const filteredEvents = events.filter(event => selectedTypes[event.type]);

  const days = getDaysInMonth(currentDate);

  const toggleType = (type) => {
    setSelectedTypes({ ...selectedTypes, [type]: !selectedTypes[type] });
  };

  return (
    <div className="min-h-[calc(100vh-73px)] bg-[#F7F8FA] p-6">
      <div className="max-w-5xl mx-auto">
        {/* Calendar Header */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h2>{monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={previousMonth}
                className="p-2 rounded-lg hover:bg-[#F7F8FA] transition-colors"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg hover:bg-[#F7F8FA] transition-colors"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center py-2 text-sm text-[#7A7A7A] font-semibold">
                {day}
              </div>
            ))}
            {days.map((day, index) => (
              <div
                key={index}
                className={`aspect-square flex items-center justify-center rounded-lg transition-all ${
                  day
                    ? isToday(day)
                      ? 'bg-[#CDE8D8] font-semibold text-[#2E2E2E]'
                      : hasEvent(day)
                      ? 'bg-white border-2 hover:shadow-md cursor-pointer'
                      : 'bg-white hover:bg-[#F7F8FA] cursor-pointer'
                    : ''
                }`}
                style={
                  day && hasEvent(day) && !isToday(day)
                    ? { borderColor: getEventColor(day) }
                    : {}
                }
              >
                {day && (
                  <div className="relative">
                    <span>{day}</span>
                    {hasEvent(day) && !isToday(day) && (
                      <div
                        className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                        style={{ backgroundColor: getEventColor(day) }}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Events Section */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3>События</h3>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTypes.meeting}
                  onChange={() => toggleType('meeting')}
                  className="w-4 h-4 rounded accent-[#C6D8E8]"
                />
                <span className="text-sm">Встречи</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTypes.task}
                  onChange={() => toggleType('task')}
                  className="w-4 h-4 rounded accent-[#E8C6D8]"
                />
                <span className="text-sm">Задачи</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedTypes.reminder}
                  onChange={() => toggleType('reminder')}
                  className="w-4 h-4 rounded accent-[#CDE8D8]"
                />
                <span className="text-sm">Напоминания</span>
              </label>
            </div>
          </div>

          <div className="space-y-3">
            {filteredEvents.length === 0 ? (
              <div className="text-center py-8 text-[#7A7A7A]">
                <CalendarIcon size={32} className="mx-auto mb-2 opacity-50" />
                <p>События не найдены</p>
              </div>
            ) : (
              filteredEvents.map((event) => (
                <div
                  key={event.id}
                  className="p-4 rounded-xl transition-all hover:shadow-md cursor-pointer"
                  style={{ backgroundColor: `${event.color}40` }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: event.color }}
                    />
                    <div className="flex-1">
                      <p className="font-semibold">{event.title}</p>
                      <p className="text-sm text-[#7A7A7A]">
                        {new Date(event.date).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <span className="text-xs px-3 py-1 rounded-full bg-white/50">
                      {event.type === 'meeting' ? 'Встреча' : event.type === 'task' ? 'Задача' : 'Напоминание'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
