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
    ['photo.jpg', FileImageIcon],
    ['logo.svg', Svg02Icon],
    ['shot.nef', Raw02Icon],
    ['clip.mp4', FileVideoIcon],
    ['song.flac', FileMusicIcon],
    ['paper.pdf', Pdf02Icon],
    ['app.log', Txt02Icon],
    ['data.csv', Csv02Icon],
    ['letter.docx', Doc02Icon],
    ['sheet.xlsx', Xls02Icon],
    ['deck.pptx', Ppt02Icon],
    ['main.go', FileCodeCornerIcon],
    ['bundle.zip', FileZipIcon],
    ['bundle.rar', Rar02Icon],
    ['bundle.tar.gz', FileArchiveIcon],
    ['setup.exe', FileDigitIcon],
  ])('%s maps to its type icon', (name, icon) => {
    expect(getFileIcon(name, false)).toBe(icon);
  });

  it('ignores extension case', () => {
    expect(getFileIcon('PHOTO.JPG', false)).toBe(FileImageIcon);
  });

  it.each(['notes.xyz', 'README'])('%s falls back to the unknown icon', (name) => {
    expect(getFileIcon(name, false)).toBe(FileUnknownIcon);
  });
});
