// 触感反馈:只在原生端触发;Web 没有触感 API,直接跳过(expo-haptics 在网页会 reject)。

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const native = Platform.OS === 'ios' || Platform.OS === 'android';

function fire(p: Promise<void>) {
  p.catch(() => {});
}

export const haptic = {
  light: () => native && fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => native && fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  selection: () => native && fire(Haptics.selectionAsync()),
  success: () => native && fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => native && fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => native && fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
