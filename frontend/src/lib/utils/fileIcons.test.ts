import { describe, expect, it } from 'vitest';
import {
  Folder01Icon,
  FileVideoIcon,
  FileImageIcon,
  FileCodeCornerIcon,
  FileMusicIcon,
  FileZipIcon,
  Rar02Icon,
  Svg02Icon,
  Csv02Icon,
  Pdf02Icon,
  Txt02Icon,
  FileArchiveIcon,
  FileUnknownIcon,
  Ppt02Icon,
  Doc02Icon,
  Xls02Icon,
  FileDigitIcon,
  Raw02Icon,
} from '@hugeicons/core-free-icons';
import { getFileIcon } from './fileIcons';

describe('getFileIcon', () => {
  it('returns the folder icon for folders, whatever the name', () => {
    expect(getFileIcon('backup.zip', true)).toBe(Folder01Icon);
  });

  it.each([
    [FileImageIcon, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'ico', 'tiff', 'tif']],
    [Svg02Icon, ['svg']],
    [Raw02Icon, ['raw', 'cr2', 'nef', 'arw']],
    [FileVideoIcon, ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v']],
    [FileMusicIcon, ['mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'wma']],
    [Pdf02Icon, ['pdf']],
    [Txt02Icon, ['txt', 'log', 'nfo']],
    [Csv02Icon, ['csv']],
    [Doc02Icon, ['doc', 'docx', 'odt']],
    [Xls02Icon, ['xls', 'xlsx', 'ods']],
    [Ppt02Icon, ['ppt', 'pptx', 'odp']],
    [
      FileCodeCornerIcon,
      [
        'json', 'js', 'ts', 'jsx', 'tsx', 'py', 'yaml', 'yml', 'md', 'html', 'htm', 'css', 'scss',
        'go', 'rs', 'cpp', 'c', 'h', 'java', 'php', 'rb', 'swift', 'kt', 'sh', 'bash', 'xml',
        'toml', 'ini', 'env', 'sql', 'graphql', 'proto', 'vue', 'svelte',
      ],
    ],
    [FileZipIcon, ['zip']],
    [Rar02Icon, ['rar']],
    [FileArchiveIcon, ['7z', 'tar', 'gz', 'bz2', 'xz', 'zst']],
    [FileDigitIcon, ['exe', 'msi', 'dmg', 'app', 'deb', 'rpm', 'bin', 'apk', 'ipa']],
  ])('maps every extension of a type to its icon', (icon, extensions) => {
    for (const ext of extensions) {
      expect(getFileIcon(`file.${ext}`, false), ext).toBe(icon);
    }
  });

  it('uses the last extension of a compound name', () => {
    expect(getFileIcon('bundle.tar.gz', false)).toBe(FileArchiveIcon);
  });

  it('ignores extension case', () => {
    expect(getFileIcon('PHOTO.JPG', false)).toBe(FileImageIcon);
  });

  it.each(['notes.xyz', 'README'])('%s falls back to the unknown icon', (name) => {
    expect(getFileIcon(name, false)).toBe(FileUnknownIcon);
  });
});
