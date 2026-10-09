export const MAX_ATTACHMENT_COUNT = 8;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 512 * 1024;
export const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
export interface AttachmentInfo { name: string; size: number; type: string }
export const attachmentExtension = (name: string) => name.split('.').at(-1)?.toLowerCase() || '';
export function attachmentError(files: Array<{ name: string; size: number }>): string {
  if (files.length > MAX_ATTACHMENT_COUNT) return 'Attach up to 8 files per message.';
  if (files.some(file => attachmentExtension(file.name) === 'pdf')) return 'Nio does not support PDF yet. Attach exported text or page images instead.';
  if (files.some(file => IMAGE_EXTENSIONS.has(attachmentExtension(file.name)) && file.size > MAX_IMAGE_BYTES)) return 'Each image must be 10 MB or smaller.';
  if (files.reduce((size, file) => size + file.size, 0) > MAX_ATTACHMENT_BYTES) return 'Attachments must total 20 MB or less.';
  if (files.filter(file => !IMAGE_EXTENSIONS.has(attachmentExtension(file.name))).reduce((size, file) => size + file.size, 0) > MAX_TEXT_BYTES) return 'Text attachments must total 512 KB or less.';
  return '';
}
