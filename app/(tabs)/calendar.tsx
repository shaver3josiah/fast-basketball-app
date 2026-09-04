import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../src/session';
import { subscribeEvents } from '../../src/data';
import type { SessionEvent } from '../../src/types';
import { Empty, Eyebrow, Screen } from '../../src/ui';
import { SESSION_TYPES, color, radius, semantic, type } from '../../src/theme';

const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function Calendar() {
  const { role, athlete } = useSession();
  const [events, setEvents] = useState<SessionEvent[] | null>(null);
  const now = new Date();

  useEffect(() => {
    if (role !== 'coach' && !athlete?.id) return;
    return subscribeEvents(role, role === 'coach' ? null : (athlete?.id ?? null), setEvents);
  }, [role, athlete?.id]);

  const month = now.getMonth();
  const year = now.getFullYear();
  const today = now.getDate();

  const thisMonth = useMemo(
    () =>
      (events ?? []).filter((e) => {
        const d = e.startsAt?.toDate?.();
        return d && d.getMonth() === month && d.getFullYear() === year;
      }),
    [events, month, year]
  );

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const byDay = new Map<number, SessionEvent[]>();
  thisMonth.forEach((e) => {
    const d = e.startsAt.toDate().getDate();
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  });

  return (
    <Screen>
      <View style={s.calHead}>
        <Text style={s.month}>{now.toLocaleDateString([], { month: 'long' })}</Text>
        <Text style={s.year}>{year}</Text>
      </View>

      <View style={s.dow}>
        {DOW.map((d) => (
          <Text key={d} style={s.dowLabel}>
            {d}
          </Text>
        ))}
      </View>

      <View style={s.grid}>
        {Array.from({ length: firstWeekday }, (_, i) => (
          <View key={`blank${i}`} style={s.cell} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const evs = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <View
              key={day}
              style={[s.cell, isToday && s.cellToday]}
              accessibilityLabel={
                evs.length
                  ? `${day}: ${evs.map((e) => `${SESSION_TYPES[e.type]?.label ?? e.type} — ${e.name}`).join(', ')}`
                  : `${day}, nothing scheduled`
              }
            >
              <Text style={[s.cellNum, isToday && { color: color.redHot, fontWeight: '800' }]}>
                {day}
              </Text>
              <View style={s.dots}>
                {evs.slice(0, 3).map((e) => (
                  <View
                    key={e.id}
                    style={[
                      s.dot,
                      e.canceled
                        ? { borderWidth: 1, borderColor: color.slate, backgroundColor: 'transparent' }
                        : { backgroundColor: SESSION_TYPES[e.type]?.color ?? color.slate },
                    ]}
                  />
                ))}
              </View>
            </View>
          );
        })}
      </View>

      <Eyebrow>Legend</Eyebrow>
      <View style={s.legend}>
        {Object.entries(SESSION_TYPES).map(([k, v]) => (
          <View key={k} style={s.legendItem}>
            <View style={[s.swatch, { backgroundColor: v.color }]} />
            <Text style={s.legendText}>
              {v.icon} {v.label}
            </Text>
          </View>
        ))}
        <View style={s.legendItem}>
          <View style={[s.swatch, { borderWidth: 1, borderColor: color.slate }]} />
          <Text style={s.legendText}>✕ Canceled</Text>
        </View>
      </View>

      <Eyebrow>Schedule</Eyebrow>
      {events === null && <Text style={type.meta}>Loading…</Text>}
      {events?.length === 0 && (
        <Empty icon="▤">Nothing on the calendar yet.{'\n'}Coach Kingsley schedules sessions here.</Empty>
      )}
      {thisMonth.map((e) => (
        <EventRow key={e.id} event={e} isToday={e.startsAt.toDate().getDate() === today} />
      ))}
    </Screen>
  );
}

function EventRow({ event, isToday }: { event: SessionEvent; isToday: boolean }) {
  const t = SESSION_TYPES[event.type] ?? { label: event.type, icon: '•', color: color.slate };
  const d = event.startsAt.toDate();
  return (
    <View style={[s.ev, { borderLeftColor: t.color }, isToday && { backgroundColor: color.inkHover }]}>
      <View style={s.evTime}>
        <Text style={[s.evClock, event.canceled && s.struck]}>
          {event.timeLabel || d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
        <Text style={s.evDate}>{d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</Text>
      </View>
      <View style={{ flex: 1 }}>
        {/* Icon + label alongside the color: colour is never the only signal (WCAG 1.4.1),
            which matters more than usual when the accent is red and the audience is boys. */}
        <Text style={[s.evType, { color: t.color }]}>
          {t.icon} {t.label}
          {event.canceled ? ' · Canceled' : ''}
          {isToday ? ' · Today' : ''}
        </Text>
        <Text style={[s.evName, event.canceled && s.struck]}>{event.name}</Text>
        <Text style={s.evMeta}>{event.location}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  calHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 12 },
  month: { fontSize: 24, fontWeight: '900', color: color.chalk, letterSpacing: -0.4 },
  year: { fontSize: 16, fontWeight: '700', color: color.textLabel },

  dow: { flexDirection: 'row', marginBottom: 4 },
  dowLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: color.textLabel,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  cellToday: { backgroundColor: color.redTint, borderRadius: radius.chip },
  cellNum: { fontSize: 13, color: color.textBody },
  dots: { flexDirection: 'row', gap: 2.5, height: 8, marginTop: 3, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 2.5 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, color: color.textDim },

  ev: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: semantic.surfaceCard,
    borderWidth: 1,
    borderColor: semantic.border,
    borderLeftWidth: 3,
    borderRadius: radius.card,
    padding: 12,
    marginBottom: 8,
  },
  evTime: { width: 58 },
  evClock: { fontSize: 15, fontWeight: '800', color: color.chalk },
  evDate: { fontSize: 11, color: color.textFaint, marginTop: 1 },
  evType: { fontSize: 11, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  evName: { fontSize: 14.5, fontWeight: '600', color: color.chalk, marginTop: 3 },
  evMeta: { ...type.meta, marginTop: 2 },
  struck: { textDecorationLine: 'line-through', opacity: 0.4 },
});
