import { Alert, Platform, ToastAndroid } from 'react-native';

function notifyCopySuccess(message: string): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert('コピー完了', message);
}

function notifyCopyFailure(message: string): void {
  Alert.alert('コピー失敗', message);
}

async function copyWithNavigatorClipboard(text: string): Promise<boolean> {
  const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (value: string) => Promise<void> } } }).navigator;
  if (!nav?.clipboard?.writeText) return false;
  await nav.clipboard.writeText(text);
  return true;
}

function copyWithExecCommand(text: string): boolean {
  const doc = (globalThis as { document?: Document }).document;
  if (!doc?.createElement || !doc.body) return false;

  const textarea = doc.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  doc.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  let copied = false;
  try {
    copied = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : false;
  } finally {
    doc.body.removeChild(textarea);
  }
  return copied;
}

export async function copyTextWithFeedback(
  text: string,
  options?: { successMessage?: string; failureMessage?: string }
): Promise<boolean> {
  const value = text.trim();
  const successMessage = options?.successMessage ?? 'コピーしました';
  const failureMessage = options?.failureMessage ?? 'コピーできませんでした。テキストを長押ししてコピーしてください。';

  if (!value) {
    notifyCopyFailure(failureMessage);
    return false;
  }

  try {
    const copiedByNavigator = await copyWithNavigatorClipboard(value);
    if (copiedByNavigator) {
      notifyCopySuccess(successMessage);
      return true;
    }
  } catch {
    // fallback to execCommand
  }

  try {
    const copiedByExecCommand = copyWithExecCommand(value);
    if (copiedByExecCommand) {
      notifyCopySuccess(successMessage);
      return true;
    }
  } catch {
    // show failure below
  }

  notifyCopyFailure(failureMessage);
  return false;
}
