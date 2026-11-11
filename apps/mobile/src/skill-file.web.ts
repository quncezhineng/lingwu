/** Web 端选择 SKILL.md：真实 <input type="file">，返回文件名与文本。 */

export interface PickedSkillFile {
  name: string;
  text: string;
}

/** 技能文件是纯文本，超过这个体积基本不是正常技能。 */
export const MAX_SKILL_BYTES = 512 * 1024;

export function pickSkillFile(): Promise<PickedSkillFile | undefined> {
  if (typeof document === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.txt,text/markdown,text/plain";
    input.style.display = "none";
    input.onchange = async () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) {
        resolve(undefined);
        return;
      }
      if (file.size > MAX_SKILL_BYTES) {
        reject(new Error("技能文件不能超过 512 KB。"));
        return;
      }
      resolve({ name: file.name, text: await file.text() });
    };
    document.body.appendChild(input);
    input.click();
  });
}
