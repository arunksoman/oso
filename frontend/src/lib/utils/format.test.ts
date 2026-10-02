import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatFileSize, getFileExtension, getFileType } from './format';

describe('formatFileSize', () => {
  it.each([
    [0, '—'],
    [1, '1 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1536, '1.5 KB'],
    [1024 * 1024, '1.0 MB'],
    [5.5 * 1024 * 1024, '5.5 MB'],
    [1024 * 1024 * 1024, '1.00 GB'],
    [2.25 * 1024 * 1024 * 1024, '2.25 GB'],
  ])('formats %d bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });
});

describe('formatDate', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it('returns a dash for an empty value', () => {
    expect(formatDate('')).toBe('—');
  });

  it.each([
    [30_000, 'Just now'],
    [5 * 60_000, '5m ago'],
    [59 * 60_000, '59m ago'],
    [3 * 3_600_000, '3h ago'],
    [2 * 86_400_000, '2d ago'],
    [6 * 86_400_000, '6d ago'],
  ])('formats %d ms ago as %s', (ms, expected) => {
    expect(formatDate(ago(ms))).toBe(expected);
  });

  it('falls back to a calendar date after a week', () => {
    const iso = ago(30 * 86_400_000);
    const expected = new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    expect(formatDate(iso)).toBe(expected);
  });
});

describe('getFileExtension', () => {
  it.each([
    ['photo.jpg', 'JPG'],
    ['archive.tar.gz', 'GZ'],
    ['README', ''],
    ['.env', 'ENV'],
  ])('%s -> %s', (name, expected) => {
    expect(getFileExtension(name)).toBe(expected);
  });
});

describe('getFileType', () => {
  it('labels folders regardless of name', () => {
    expect(getFileType('photos.old', true)).toBe('Folder');
  });

  it('uses the upper-cased extension for files', () => {
    expect(getFileType('report.pdf', false)).toBe('PDF');
  });

  it('falls back to File without an extension', () => {
    expect(getFileType('Makefile', false)).toBe('File');
  });
});
