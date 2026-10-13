// Phosphor Icons, MIT. Embedded at build time; no fonts or network requests.
import parcel from '@phosphor-icons/core/assets/duotone/package-duotone.svg';
import upload from '@phosphor-icons/core/assets/duotone/upload-simple-duotone.svg';
import arrow from '@phosphor-icons/core/assets/duotone/arrow-right-duotone.svg';
import lock from '@phosphor-icons/core/assets/duotone/shield-check-duotone.svg';
import search from '@phosphor-icons/core/assets/duotone/magnifying-glass-duotone.svg';
import check from '@phosphor-icons/core/assets/duotone/check-circle-duotone.svg';
import file from '@phosphor-icons/core/assets/duotone/file-text-duotone.svg';
import close from '@phosphor-icons/core/assets/duotone/x-circle-duotone.svg';
import code from '@phosphor-icons/core/assets/duotone/code-block-duotone.svg';
import down from '@phosphor-icons/core/assets/duotone/download-simple-duotone.svg';
import help from '@phosphor-icons/core/assets/duotone/question-duotone.svg';
import network from '@phosphor-icons/core/assets/duotone/tree-structure-duotone.svg';
import send from '@phosphor-icons/core/assets/duotone/paper-plane-tilt-duotone.svg';

const icons: Record<string, string> = {
  parcel,
  upload,
  arrow,
  lock,
  search,
  check,
  file,
  close,
  code,
  down,
  help,
  network,
  send,
};
export const icon = (name: string, className = '') =>
  icons[name]
    .replace('<svg ', `<svg class="icon ${className}" aria-hidden="true" `)
    .replaceAll('fill="#000000"', 'fill="currentColor"');
