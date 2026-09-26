import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleDot,
  CirclePlay,
  CircleX,
  Clipboard,
  Clock,
  Copy,
  Dumbbell,
  ExternalLink,
  Eye,
  FileText,
  Film,
  Flame,
  Info,
  LifeBuoy,
  Lock,
  Mail,
  MessageSquare,
  MessagesSquare,
  Minus,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  ShieldCheck,
  Sparkles,
  Timer,
  Trash,
  Undo2,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';

/**
 * Every UI icon in the app, from Lucide. Session TYPES are not here: they are drawn by
 * SessionGlyph, so a category has exactly one look wherever it appears.
 *
 * The keys are the Ionicons names the app used before, so call sites kept their shape
 * and only the import changed. A name missing from this map is a type error, which is
 * what made the swap safe to do in one pass.
 */
const ICONS = {
  add: Plus,
  remove: Minus,
  close: X,
  checkmark: Check,
  'checkmark-sharp': Check,
  'checkmark-circle': CircleCheck,
  'close-circle-outline': CircleX,
  'chevron-back': ChevronLeft,
  'chevron-forward': ChevronRight,
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  'arrow-up': ArrowUp,
  'arrow-down': ArrowDown,
  'return-up-back': Undo2,
  'calendar-outline': Calendar,
  'chatbubble-outline': MessageSquare,
  'chatbubbles-outline': MessagesSquare,
  'person-outline': User,
  'people-outline': Users,
  'copy-outline': Copy,
  'clipboard-outline': Clipboard,
  'trash-outline': Trash,
  'eye-outline': Eye,
  'lock-closed-outline': Lock,
  'lock-closed': Lock,
  'radio-button-on': CircleDot,
  'radio-button-off': Circle,
  'information-circle-outline': Info,
  'shield-checkmark-outline': ShieldCheck,
  'help-buoy-outline': LifeBuoy,
  'document-text-outline': FileText,
  'open-outline': ExternalLink,
  'mail-outline': Mail,
  'ellipse-outline': Circle,
  'time-outline': Clock,
  'stopwatch-outline': Timer,
  'repeat-outline': Repeat,
  'refresh-outline': RefreshCw,
  'flame-outline': Flame,
  flame: Flame,
  'sparkles-outline': Sparkles,
  'barbell-outline': Dumbbell,
  'pulse-outline': Activity,
  'play-circle-outline': CirclePlay,
  'play-circle': CirclePlay,
  'film-outline': Film,
  'color-palette-outline': Palette,
  play: Play,
  pause: Pause,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Ionicons had solid variants for "on" states. Lucide is line only, so the ones that
 *  meant "lit" are filled here with a quiet tint of their own colour. */
const FILLED = new Set<IconName>(['flame', 'play', 'pause']);

export function Icon({
  name,
  size = 20,
  color,
  style,
}: {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}) {
  const L = ICONS[name];
  // One stroke weight at every size, near the drawn session symbols' 1.5px, so a 13px
  // chip icon and a 30px empty-state icon read as one family instead of hairline vs bold.
  const c = color as string | undefined;
  return (
    <L
      size={size}
      color={c}
      fill={FILLED.has(name) ? c : 'none'}
      fillOpacity={0.3}
      strokeWidth={1.75}
      absoluteStrokeWidth
      style={style}
    />
  );
}
