export function downloadJson(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  try { anchor.click(); }
  finally {
    anchor.remove();
    // The click only queues the download; a browser that starts fetching the
    // blob in a later task loses the file if the URL is revoked right here.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
