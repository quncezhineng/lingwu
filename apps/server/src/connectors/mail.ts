import { connect as tlsConnect } from "node:tls";

export type MailLogin = {
  host: string;
  port: number;
  protocol: "imap" | "pop3";
  email: string;
  code: string;
};

export type MailMessage = {
  index: string;
  from: string;
  subject: string;
  date: string;
  body?: string;
};

export type MailTransport = {
  check(login: MailLogin): Promise<void>;
  recent(login: MailLogin, limit: number): Promise<MailMessage[]>;
  read(login: MailLogin, index: string): Promise<MailMessage>;
};

function quote(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function decodeHeader(value: string): string {
  return value
    .replace(/=\?([^?]+)\?B\?([^?]+)\?=/gi, (_all, _charset: string, data: string) => {
      try {
        return Buffer.from(data, "base64").toString("utf8");
      } catch {
        return "";
      }
    })
    .replace(/=\?([^?]+)\?Q\?([^?]+)\?=/gi, (_all, _charset: string, data: string) =>
      data.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, hex: string) =>
        String.fromCharCode(Number.parseInt(hex, 16)),
      ),
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function headerValue(raw: string, name: string): string {
  const match = raw.match(new RegExp(`^${name}:\\s*(.+)$`, "im"));
  return decodeHeader(match?.[1] ?? "");
}

class LineSocket {
  private pending = "";
  private waiters: ((line: string) => void)[] = [];
  constructor(private readonly socket: import("node:tls").TLSSocket) {
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      this.pending += chunk;
      let index = this.pending.indexOf("\n");
      while (index >= 0) {
        const line = this.pending.slice(0, index).replace(/\r$/, "");
        this.pending = this.pending.slice(index + 1);
        this.waiters.shift()?.(line);
        index = this.pending.indexOf("\n");
      }
    });
  }
  send(line: string) {
    this.socket.write(`${line}\r\n`);
  }
  async line(): Promise<string> {
    if (this.pending.includes("\n")) {
      const index = this.pending.indexOf("\n");
      const line = this.pending.slice(0, index).replace(/\r$/, "");
      this.pending = this.pending.slice(index + 1);
      return line;
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("邮箱服务器暂时连不上，请稍后再试。")), 12000);
      this.waiters.push((value) => {
        clearTimeout(timer);
        resolve(value);
      });
      this.socket.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }
  end() {
    this.socket.end();
  }
}

function openTls(host: string, port: number): Promise<LineSocket> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect({ host, port, servername: host, rejectUnauthorized: true });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("邮箱服务器暂时连不上，请稍后再试。"));
    }, 12000);
    socket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(new LineSocket(socket));
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function imap(login: MailLogin, readIndex?: string, limit = 5): Promise<MailMessage[]> {
  const io = await openTls(login.host, login.port);
  try {
    const greet = await io.line();
    if (!greet.startsWith("* OK")) throw new Error("邮箱服务器暂时连不上，请稍后再试。");
    io.send(`A1 LOGIN ${quote(login.email)} ${quote(login.code)}`);
    const auth = await io.line();
    if (!auth.startsWith("A1 OK"))
      throw new Error("授权码被拒绝。请确认已开启 IMAP，并且粘贴的是授权码或应用专用密码，不是登录密码。");
    io.send("A2 SELECT INBOX");
    let exists = 0;
    for (;;) {
      const line = await io.line();
      const count = line.match(/^\* (\d+) EXISTS/);
      if (count) exists = Number(count[1]);
      if (line.startsWith("A2 ")) break;
    }
    const wanted = readIndex
      ? [Number(readIndex)]
      : Array.from({ length: Math.min(limit, exists) }, (_item, index) => exists - index).filter(
          (n) => n > 0,
        );
    const messages: MailMessage[] = [];
    for (const index of wanted) {
      io.send(`A3 FETCH ${index} (BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)] BODY.PEEK[TEXT]<0.1200>)`);
      let blob = "";
      for (;;) {
        const line = await io.line();
        if (line.startsWith("A3 ")) break;
        blob += `${line}\n`;
      }
      messages.push({
        index: String(index),
        from: headerValue(blob, "From"),
        subject: headerValue(blob, "Subject"),
        date: headerValue(blob, "Date"),
        ...(readIndex ? { body: blob.replace(/^[^]*?\n\n/, "").slice(0, 2000) } : {}),
      });
    }
    io.send("A4 LOGOUT");
    return messages;
  } finally {
    io.end();
  }
}

async function pop3(login: MailLogin, readIndex?: string, limit = 5): Promise<MailMessage[]> {
  const io = await openTls(login.host, login.port);
  try {
    const greet = await io.line();
    if (!greet.startsWith("+OK")) throw new Error("邮箱服务器暂时连不上，请稍后再试。");
    io.send(`USER ${login.email}`);
    if (!(await io.line()).startsWith("+OK")) throw new Error("授权码被拒绝。");
    io.send(`PASS ${login.code}`);
    if (!(await io.line()).startsWith("+OK"))
      throw new Error("授权码被拒绝。请确认已开启 POP3，并且粘贴的是授权码，不是登录密码。");
    io.send("STAT");
    const stat = await io.line();
    const count = Number(stat.split(" ")[1] ?? 0);
    const indexes = readIndex
      ? [readIndex]
      : Array.from({ length: Math.min(limit, count) }, (_item, index) => String(count - index)).filter(
          (n) => Number(n) > 0,
        );
    const messages: MailMessage[] = [];
    for (const index of indexes) {
      io.send(`TOP ${index} 20`);
      const first = await io.line();
      if (!first.startsWith("+OK")) continue;
      let blob = "";
      for (;;) {
        const line = await io.line();
        if (line === ".") break;
        blob += `${line}\n`;
      }
      messages.push({
        index,
        from: headerValue(blob, "From"),
        subject: headerValue(blob, "Subject"),
        date: headerValue(blob, "Date"),
        ...(readIndex ? { body: blob.slice(0, 2000) } : {}),
      });
    }
    io.send("QUIT");
    return messages;
  } finally {
    io.end();
  }
}

export const defaultMailTransport: MailTransport = {
  async check(login) {
    if (login.protocol === "pop3") await pop3(login, undefined, 1);
    else await imap(login, undefined, 1);
  },
  async recent(login, limit) {
    return login.protocol === "pop3" ? pop3(login, undefined, limit) : imap(login, undefined, limit);
  },
  async read(login, index) {
    const rows = login.protocol === "pop3" ? await pop3(login, index, 1) : await imap(login, index, 1);
    const found = rows[0];
    if (!found) throw new Error("没有找到这封邮件。");
    return found;
  },
};

let current = defaultMailTransport;

export function setMailTransport(next: MailTransport | null) {
  current = next ?? defaultMailTransport;
}

export function mailTransport(): MailTransport {
  return current;
}
