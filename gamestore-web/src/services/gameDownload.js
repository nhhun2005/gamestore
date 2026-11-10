export function gameDownloadFilename(title) {
  let name = String(title ?? "")
    // Control characters and Windows path separators cannot be used in filenames.
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");
  if (!name) name = "Trò chơi";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  return `${name}.md`;
}

export function downloadGame(title) {
  const url = URL.createObjectURL(new Blob([], { type: "text/markdown;charset=utf-8" }));
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = gameDownloadFilename(title);
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    // Let the browser start reading the download before releasing its object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
