/**
 * CSV 生成とダウンロード（Web 用）
 */

/**
 * 1 フィールドの CSV エスケープ（カンマ・改行・ダブルクォートを囲む）
 */
function escapeCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * ヘッダーと行から CSV 文字列を生成
 */
export function toCsv(
  headers: string[],
  rows: Record<string, string | number | null | undefined>[]
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCsvCell(row[h])).join(',')
  );
  return [headerLine, ...dataLines].join('\r\n');
}

/**
 * テキストファイルをダウンロード（Web: Blob + a[download]）
 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8;'
): void {
  if (typeof window === 'undefined' || !window.URL?.createObjectURL) return;
  const blob = new Blob(['\uFEFF' + content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
