import net from "node:net";

const host = process.env.CLAMAV_HOST || "clamav";
const port = Number(process.env.CLAMAV_PORT) || 3310;
const required = process.env.ANTIVIRUS_REQUIRED !== "0";

export type AntivirusResult = { clean: true } | { clean: false; threat: string };

export async function scanBuffer(buffer: Buffer): Promise<AntivirusResult> {
  if (!required) return { clean: true };
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const chunks: Buffer[] = [];
    const fail = (error: Error) => reject(new Error(`Antivirus non disponibile: ${error.message}`));
    socket.setTimeout(30_000, () => socket.destroy(new Error("timeout")));
    socket.once("error", fail);
    socket.on("data", chunk => chunks.push(Buffer.from(chunk)));
    socket.once("connect", () => {
      socket.write("zINSTREAM\0");
      const size = Buffer.alloc(4);
      size.writeUInt32BE(buffer.length);
      socket.write(size);
      socket.write(buffer);
      socket.write(Buffer.alloc(4));
    });
    socket.once("end", () => {
      const response = Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim();
      if (response.endsWith("OK")) return resolve({ clean: true });
      const match = response.match(/stream:\s+(.+)\s+FOUND/i);
      if (match) return resolve({ clean: false, threat: match[1] });
      reject(new Error(`Risposta antivirus non valida: ${response || "vuota"}`));
    });
  });
}
