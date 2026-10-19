export type PreparedExcelDownload = { url: string; filename: string };

/** Keep the URL alive for an explicit, synchronous user click when an async
 * RPC/import has lost the browser's original download activation. */
export function prepareExcelDownload(bytes: Uint8Array, filename: string): PreparedExcelDownload {
  if (!bytes.byteLength) throw new Error('File Excel rỗng, chưa thể tải.');
  if (!filename.endsWith('.xlsx') || /[\\/]|\p{Cc}/u.test(filename)) throw new Error('Tên file Excel không hợp lệ.');
  const blob = new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  return { url: URL.createObjectURL(blob), filename };
}

export function startExcelDownload(file: PreparedExcelDownload): void {
  const link = document.createElement('a');
  link.href = file.url;
  link.download = file.filename;
  link.hidden = true;
  // Attached anchors are more reliable than detached link.click() in WebViews.
  document.body.appendChild(link);
  try { link.click(); } finally { link.remove(); }
}

export function revokeExcelDownload(file: PreparedExcelDownload): void {
  URL.revokeObjectURL(file.url);
}

/** Legacy one-shot exports retain enough time for the browser to consume bytes. */
export function saveExcelDownload(bytes: Uint8Array, filename: string): void {
  const file = prepareExcelDownload(bytes, filename);
  try { startExcelDownload(file); }
  catch (error) { revokeExcelDownload(file); throw error; }
  setTimeout(() => revokeExcelDownload(file), 60_000);
}
