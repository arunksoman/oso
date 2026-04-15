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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getFileIcon(name: string, isFolder: boolean): any {
  if (isFolder) return Folder01Icon;

  const ext = name.split('.').pop()?.toLowerCase() ?? '';

  switch (ext) {
    // Images
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'gif':
    case 'webp':
    case 'bmp':
    case 'ico':
    case 'tiff':
    case 'tif':
      return FileImageIcon;

    case 'svg':
      return Svg02Icon;

    case 'raw':
    case 'cr2':
    case 'nef':
    case 'arw':
      return Raw02Icon;

    // Video
    case 'mp4':
    case 'avi':
    case 'mov':
    case 'mkv':
    case 'wmv':
    case 'flv':
    case 'webm':
    case 'm4v':
      return FileVideoIcon;

    // Audio
    case 'mp3':
    case 'wav':
    case 'flac':
    case 'ogg':
    case 'm4a':
    case 'aac':
    case 'wma':
      return FileMusicIcon;

    // Documents
    case 'pdf':
      return Pdf02Icon;

    case 'txt':
    case 'log':
    case 'nfo':
      return Txt02Icon;

    case 'csv':
      return Csv02Icon;

    case 'doc':
    case 'docx':
    case 'odt':
      return Doc02Icon;

    case 'xls':
    case 'xlsx':
    case 'ods':
      return Xls02Icon;

    case 'ppt':
    case 'pptx':
    case 'odp':
      return Ppt02Icon;

    // Code / data
    case 'json':
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'py':
    case 'yaml':
    case 'yml':
    case 'md':
    case 'html':
    case 'htm':
    case 'css':
    case 'scss':
    case 'go':
    case 'rs':
    case 'cpp':
    case 'c':
    case 'h':
    case 'java':
    case 'php':
    case 'rb':
    case 'swift':
    case 'kt':
    case 'sh':
    case 'bash':
    case 'xml':
    case 'toml':
    case 'ini':
    case 'env':
    case 'sql':
    case 'graphql':
    case 'proto':
    case 'vue':
    case 'svelte':
      return FileCodeCornerIcon;

    // Archives
    case 'zip':
      return FileZipIcon;

    case 'rar':
      return Rar02Icon;

    case '7z':
    case 'tar':
    case 'gz':
    case 'bz2':
    case 'xz':
    case 'zst':
      return FileArchiveIcon;

    // Executables / binaries
    case 'exe':
    case 'msi':
    case 'dmg':
    case 'app':
    case 'deb':
    case 'rpm':
    case 'bin':
    case 'apk':
    case 'ipa':
      return FileDigitIcon;

    default:
      return FileUnknownIcon;
  }
}
