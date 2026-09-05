import { useMemo } from "react";
import type { TimeEntry } from "../../models/types";
import { getMonthGrid, isSameDay, isSameMonth, monthLabel, parseDateKey, toDateKey } from "../../utils/calendar";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface TimesheetCalendarProps {
  entries: TimeEntry[];
  year: number;
  month: number;
  selectedDate: string | null;
  onMonthChange: (year: number, month: number) => void;
  onSelectDate: (dateKey: string | null) => void;
}

function hoursTone(totalHours: number): string {
  if (totalHours <= 0) return "";
  if (totalHours < 4) return "low";
  if (totalHours < 8) return "medium";
  return "high";
}

export function TimesheetCalendar({
  entries,
  year,
  month,
  selectedDate,
  onMonthChange,
  onSelectDate,
}: TimesheetCalendarProps) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);

  const hoursByDate = useMemo(() => {
    const map = new Map<string, { hours: number; count: number }>();
    for (const entry of entries) {
      const existing = map.get(entry.work_date) ?? { hours: 0, count: 0 };
      map.set(entry.work_date, {
        hours: existing.hours + entry.hours,
        count: existing.count + 1,
      });
    }
    return map;
  }, [entries]);

  const monthTotal = useMemo(() => {
    let hours = 0;
    let count = 0;
    for (const [dateKey, data] of hoursByDate) {
      const d = parseDateKey(dateKey);
      if (isSameMonth(d, year, month)) {
        hours += data.hours;
        count += data.count;
      }
    }
    return { hours, count };
  }, [hoursByDate, year, month]);

  const weeks = useMemo(() => {
    const grid = getMonthGrid(year, month);
    const rows: Date[][] = [];
    for (let i = 0; i < grid.length; i += 7) {
      rows.push(grid.slice(i, i + 7));
    }
    return rows;
  }, [year, month]);

  const shiftMonth = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    onMonthChange(d.getFullYear(), d.getMonth());
  };

  const goToday = () => {
    onMonthChange(today.getFullYear(), today.getMonth());
    onSelectDate(todayKey);
  };

  return (
    <section className="card timesheet-calendar">
      <div className="timesheet-calendar-head">
        <div>
          <h3 className="card-title">Calendar overview</h3>
          <p className="muted">
            {monthTotal.hours.toFixed(1)}h logged in {monthLabel(year, month)}
            {monthTotal.count > 0 ? ` · ${monthTotal.count} ${monthTotal.count === 1 ? "entry" : "entries"}` : ""}
          </p>
        </div>
        <div className="timesheet-calendar-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            ‹
          </button>
          <strong className="timesheet-calendar-month">{monthLabel(year, month)}</strong>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => shiftMonth(1)} aria-label="Next month">
            ›
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={goToday}>
            Today
          </button>
          {selectedDate && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => onSelectDate(null)}>
              Clear day
            </button>
          )}
        </div>
      </div>

      <div className="timesheet-calendar-grid" role="grid" aria-label={`Timesheet calendar for ${monthLabel(year, month)}`}>
        {WEEKDAYS.map((label) => (
          <div key={label} className="timesheet-calendar-weekday" role="columnheader">
            {label}
          </div>
        ))}

        {weeks.flatMap((week) =>
          week.map((date) => {
            const dateKey = toDateKey(date);
            const inMonth = isSameMonth(date, year, month);
            const dayData = hoursByDate.get(dateKey);
            const totalHours = dayData?.hours ?? 0;
            const entryCount = dayData?.count ?? 0;
            const isToday = isSameDay(date, today);
            const isSelected = selectedDate === dateKey;
            const tone = hoursTone(totalHours);

            return (
              <button
                key={dateKey}
                type="button"
                role="gridcell"
                className={[
                  "timesheet-calendar-day",
                  !inMonth ? "outside" : "",
                  isToday ? "today" : "",
                  isSelected ? "selected" : "",
                  tone ? `has-hours tone-${tone}` : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSelectDate(isSelected ? null : dateKey)}
                aria-label={`${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${totalHours > 0 ? `, ${totalHours.toFixed(1)} hours logged` : ", no time logged"}`}
                aria-pressed={isSelected}
              >
                <span className="timesheet-calendar-day-num">{date.getDate()}</span>
                {totalHours > 0 && (
                  <>
                    <span className="timesheet-calendar-hours">{totalHours.toFixed(1)}h</span>
                    <span className="timesheet-calendar-count">{entryCount}</span>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="timesheet-calendar-legend">
        <span className="legend-item"><span className="legend-swatch tone-low" /> &lt; 4h</span>
        <span className="legend-item"><span className="legend-swatch tone-medium" /> 4–8h</span>
        <span className="legend-item"><span className="legend-swatch tone-high" /> 8h+</span>
      </div>
    </section>
  );
}
