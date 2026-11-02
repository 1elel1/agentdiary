// Android / Web 回退:SF Symbols 名 → Material Icons 名。iOS 走 icon-symbol.ios.tsx 用原生 SymbolView。
// 新增图标时两边都要能找到:SF 名要真实存在(iOS 15+),Material 名要在 glyph map 里。

import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SymbolWeight } from 'expo-symbols';
import { ComponentProps } from 'react';
import { OpaqueColorValue, type StyleProp, type TextStyle } from 'react-native';

type MaterialName = ComponentProps<typeof MaterialIcons>['name'];

const MAPPING = {
  'house.fill': 'home',
  'paperplane.fill': 'send',
  'chevron.left.forwardslash.chevron.right': 'code',
  'chevron.right': 'chevron-right',
  'chevron.left': 'chevron-left',
  'chevron.down': 'expand-more',
  'chevron.up': 'expand-less',
  'book.fill': 'menu-book',
  'books.vertical.fill': 'library-books',
  'bubble.left.and.bubble.right.fill': 'forum',
  'bubble.left.fill': 'chat-bubble',
  'quote.bubble.fill': 'format-quote',
  'text.quote': 'format-quote',
  'person.2.fill': 'people',
  'person.fill': 'person',
  'person.crop.circle': 'person-outline',
  'person.crop.circle.fill': 'account-circle',
  'person.text.rectangle.fill': 'badge',
  'person.wave.2.fill': 'record-voice-over',
  'person.badge.plus': 'person-add',
  'paintbrush.fill': 'brush',
  calendar: 'calendar-today',
  'lock.fill': 'lock',
  'lock.open.fill': 'lock-open',
  'lock.rotation': 'lock-reset',
  'key.fill': 'vpn-key',
  'gearshape.fill': 'settings',
  'rectangle.portrait.and.arrow.right': 'logout',
  'arrow.clockwise': 'refresh',
  'arrow.triangle.2.circlepath': 'sync',
  'arrow.up': 'arrow-upward',
  'arrow.up.circle.fill': 'arrow-upward',
  'arrow.right': 'arrow-forward',
  'square.and.pencil': 'edit',
  xmark: 'close',
  'xmark.circle.fill': 'cancel',
  checkmark: 'check',
  'checkmark.circle.fill': 'check-circle',
  'checkmark.square.fill': 'check-box',
  square: 'check-box-outline-blank',
  circle: 'radio-button-unchecked',
  plus: 'add',
  ellipsis: 'more-horiz',
  sparkles: 'auto-awesome',
  'wand.and.stars': 'auto-fix-high',
  'pin.fill': 'push-pin',
  'pin.slash.fill': 'push-pin',
  'trash.fill': 'delete',
  'eye.fill': 'visibility',
  'eye.slash.fill': 'visibility-off',
  hourglass: 'hourglass-empty',
  clock: 'schedule',
  'clock.fill': 'schedule',
  timer: 'timer',
  'scalemass.fill': 'balance',
  'hand.wave.fill': 'waving-hand',
  'brain.head.profile': 'psychology',
  'face.smiling': 'mood',
  'moon.fill': 'dark-mode',
  'sun.max.fill': 'light-mode',
  'photo.fill': 'photo',
  'camera.fill': 'photo-camera',
  'info.circle': 'info',
  'exclamationmark.triangle.fill': 'warning',
  'wifi.slash': 'wifi-off',
  'icloud.slash.fill': 'cloud-off',
  'tray.fill': 'inbox',
  'doc.text.fill': 'description',
  'note.text': 'notes',
  'star.fill': 'star',
  'bolt.fill': 'bolt',
  'heart.fill': 'favorite',
  'theatermasks.fill': 'theater-comedy',
  'lightbulb.fill': 'lightbulb',
  'questionmark.circle': 'help-outline',
  'shield.fill': 'shield',
  'checkmark.shield.fill': 'verified-user',
  globe: 'public',
  'bell.fill': 'notifications',
  magnifyingglass: 'search',
  'line.3.horizontal': 'drag-handle',
  'text.alignleft': 'notes',
  'figure.walk': 'directions-walk',
  'minus.circle.fill': 'remove-circle',
} as const satisfies Record<string, MaterialName>;

export type IconSymbolName = keyof typeof MAPPING;

/**
 * iOS 用原生 SF Symbols,其他平台用 Material Icons。
 * 名字以 SF Symbols 为准,需手动维护到 Material 的映射。
 */
export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  return <MaterialIcons color={color} size={size} name={MAPPING[name]} style={style} />;
}
