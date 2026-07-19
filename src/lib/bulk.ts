import type { TaskSize, TaskTag } from '../types';

const TAGS: TaskTag[] = ['systems', 'art', 'design', 'polish', 'biz'];
const SIZES = ['S', 'M', 'L'];

export interface BulkTask {
  title: string;
  description?: string;
  size: TaskSize;
  tag: TaskTag;
}

export interface BulkParse {
  tasks: BulkTask[];
  errors: { line: number; message: string }[];
}

/**
 * One task per line:
 *   Title | Descriptor | Size | Category
 *   Title | Size | Category            (no descriptor)
 * Size is S/M/L, category one of the five tags — both case-insensitive.
 * Extra pipes are assumed to belong to the descriptor, so pasted text with
 * `|` inside the notes still parses (last two fields are always size + tag).
 */
export function parseBulkTasks(text: string): BulkParse {
  const tasks: BulkTask[] = [];
  const errors: { line: number; message: string }[] = [];

  text.split('\n').forEach((raw, idx) => {
    const line = raw.trim();
    if (!line) return;
    const lineNo = idx + 1;
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length < 3) {
      errors.push({ line: lineNo, message: 'expected "Title | Size | Category" or "Title | Descriptor | Size | Category"' });
      return;
    }
    const title = parts[0];
    const sizeRaw = parts[parts.length - 2];
    const tagRaw = parts[parts.length - 1];
    const description = parts.slice(1, parts.length - 2).join(' | ') || undefined;

    if (!title) {
      errors.push({ line: lineNo, message: 'missing title' });
      return;
    }
    const size = sizeRaw.toUpperCase();
    if (!SIZES.includes(size)) {
      errors.push({ line: lineNo, message: `size must be S, M, or L (got "${sizeRaw}")` });
      return;
    }
    const tag = TAGS.find((t) => t === tagRaw.toLowerCase());
    if (!tag) {
      errors.push({ line: lineNo, message: `category must be one of ${TAGS.join(' / ')} (got "${tagRaw}")` });
      return;
    }
    tasks.push({
      title: title.slice(0, 80),
      description: description?.slice(0, 2000),
      size: size as TaskSize,
      tag
    });
  });

  return { tasks, errors };
}
