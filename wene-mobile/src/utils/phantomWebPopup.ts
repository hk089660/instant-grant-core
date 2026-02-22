const POPUP_TARGET = 'wene-phantom-wallet';
let popupRef: Window | null = null;

const canUseWindow = (): boolean =>
  typeof window !== 'undefined' && typeof window.open === 'function';

function isPopupAlive(popup: Window | null): popup is Window {
  return Boolean(popup && !popup.closed);
}

function openPopup(url: string): Window | null {
  if (!canUseWindow()) return null;
  try {
    return window.open(url, POPUP_TARGET, 'width=480,height=760');
  } catch {
    return null;
  }
}

export function preparePhantomWebPopup(): boolean {
  if (!canUseWindow()) return false;

  if (isPopupAlive(popupRef)) {
    try {
      popupRef.focus();
    } catch {
      // no-op
    }
    return true;
  }

  const popup = openPopup('about:blank');
  if (!popup) return false;
  popupRef = popup;
  try {
    popup.document.title = 'Phantom署名待機';
    popup.document.body.innerHTML = '<p style="font-family: sans-serif; padding: 12px;">Phantom署名を開始しています...</p>';
  } catch {
    // cross-origin 移動前なので通常は到達するが、失敗しても問題ない
  }
  return true;
}

export function openPhantomWebPopup(url: string): boolean {
  if (!canUseWindow()) return false;

  if (isPopupAlive(popupRef)) {
    try {
      popupRef.location.href = url;
      popupRef.focus();
      return true;
    } catch {
      // dead/blocked なら再オープンへ
    }
  }

  const popup = openPopup(url);
  if (!popup) return false;
  popupRef = popup;
  try {
    popup.focus();
  } catch {
    // no-op
  }
  return true;
}
