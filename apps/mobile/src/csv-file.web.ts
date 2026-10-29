/** Web 端 CSV 文件选择：真实 <input type="file">，返回文件名与文本。 */
export interface PickedCsv {
  name: string;
  text: string;
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function pickCsvFile(): Promise<PickedCsv | undefined> {
  if (typeof document === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv,text/csv";
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(undefined);
        return;
      }
      resolve({ name: file.name, text: await readFileAsText(file) });
    };
    document.body.appendChild(input);
    input.click();
  });
}

/** 触发浏览器下载（模板、错误行或导出的简报）。 */
export function saveTextFile(name: string, text: string, mimeType = "text/csv;charset=utf-8") {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
