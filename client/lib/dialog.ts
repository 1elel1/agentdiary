// 跨平台弹窗:替代 RN 的 Alert。
//
// 为什么不用 Alert.alert:react-native-web 里它是空实现(`static alert() {}`),
// 网页版上「删除日记」「退出登录」「注销账号」这些确认框全部静默失效;
// Alert.prompt 更是只有 iOS 有。这里用自绘的 iOS 风格弹窗统一三端,
// 由根布局里的 <DialogHost /> 渲染,业务代码只管 await。

import { create } from 'zustand';

import { getDict } from './i18n';

export interface DialogAction {
  label: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export interface DialogSpec {
  id: number;
  title: string;
  message?: string;
  actions: DialogAction[];
}

interface DialogState {
  queue: DialogSpec[];
  push: (spec: Omit<DialogSpec, 'id'>) => number;
  dismiss: (id: number) => void;
}

let seq = 0;

export const useDialogStore = create<DialogState>((set) => ({
  queue: [],
  push: (spec) => {
    const id = ++seq;
    set((s) => ({ queue: [...s.queue, { ...spec, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((d) => d.id !== id) })),
}));

export const dialog = {
  /** 只有一个「知道了」的提示。 */
  alert(title: string, message?: string): Promise<void> {
    return new Promise((resolve) => {
      useDialogStore.getState().push({
        title,
        message,
        actions: [{ label: getDict().common.ok, style: 'cancel', onPress: () => resolve() }],
      });
    });
  },

  /** 取消 / 确定 二选一;resolve(true) 表示确认。 */
  confirm(opts: {
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    destructive?: boolean;
  }): Promise<boolean> {
    return new Promise((resolve) => {
      useDialogStore.getState().push({
        title: opts.title,
        message: opts.message,
        actions: [
          { label: opts.cancelText ?? getDict().common.cancel, style: 'cancel', onPress: () => resolve(false) },
          {
            label: opts.confirmText ?? getDict().common.confirm,
            style: opts.destructive ? 'destructive' : 'default',
            onPress: () => resolve(true),
          },
        ],
      });
    });
  },

  /** 自定义按钮组;返回被点中的按钮下标。 */
  show(title: string, message: string | undefined, actions: DialogAction[]): Promise<number> {
    return new Promise((resolve) => {
      useDialogStore.getState().push({
        title,
        message,
        actions: actions.map((a, i) => ({
          ...a,
          onPress: () => {
            a.onPress?.();
            resolve(i);
          },
        })),
      });
    });
  },
};
