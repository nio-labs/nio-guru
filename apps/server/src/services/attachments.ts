import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachmentError, attachmentExtension, IMAGE_EXTENSIONS, type AttachmentInfo } from '../../../../packages/shared/src/attachments.js';

export async function stageAttachments(files: File[]) {
  const error = attachmentError(files);
  if (error) throw new Error(error);
  const directory = files.length ? fs.mkdtempSync(path.join(os.tmpdir(), 'nio-guru-attachments-')) : '';
  const cleanup = () => { if (directory) fs.rmSync(directory, { recursive: true, force: true }); };
  const paths: string[] = [];
  const metadata: AttachmentInfo[] = [];
  try {
    for (const [index, file] of files.entries()) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const name = file.name.split(/[\\/]/).at(-1)?.replace(/[\x00-\x1f]/g, '').slice(0, 180) || 'attachment.txt';
      const extension = attachmentExtension(name);
      if (IMAGE_EXTENSIONS.has(extension)) {
        const valid = extension === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          : extension === 'jpg' || extension === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : extension === 'gif' ? /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString())
          : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
        if (!valid) throw new Error(`${name} is not a valid ${extension.toUpperCase()} image.`);
      } else {
        let text: string;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { throw new Error(`${name} is not UTF-8 text. Attach a text file or supported image.`); }
        if (text.includes('\0') || bytes.subarray(0, 5).toString() === '%PDF-') throw new Error(`${name} is a binary file. Attach UTF-8 text or a supported image.`);
      }
      const destination = path.join(directory, `${index}-${name}`);
      fs.writeFileSync(destination, bytes, { mode: 0o600, flag: 'wx' });
      paths.push(destination);
      metadata.push({ name, size: bytes.length, type: IMAGE_EXTENSIONS.has(extension) ? `image/${extension === 'jpg' ? 'jpeg' : extension}` : 'text/plain' });
    }
    return { paths, metadata, cleanup };
  } catch (error) { cleanup(); throw error; }
}
