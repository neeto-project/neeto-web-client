import PencilOffIcon from '../../icons/ic-pencil-off.svg';
import RichTextIcon from '../../icons/ic-text-rich.svg';
import TrashIcon from '../../icons/ic-trash.svg';
import PinIcon from '../../icons/ic-pin.svg';
import UnpinIcon from '../../icons/ic-pin-off.svg';
import ArchiveIcon from '../../icons/ic-archive.svg';
import UnarchiveIcon from '../../icons/ic-unarchive.svg';
import HashtagIcon from '../../icons/ic-hashtag.svg';
import ChevronRightIcon from '../../icons/ic-chevron-right.svg';
import RestoreIcon from '../../icons/ic-restore.svg';
import CloseIcon from '../../icons/ic-close.svg';
import PasswordIcon from '../../icons/ic-textbox-password.svg';
import TrashSweepIcon from '../../icons/ic-trash-sweep.svg';
import MoreIcon from '../../icons/ic-more.svg';
import TuneIcon from '../../icons/ic-tune.svg';

import AccessibilityIcon from '../../icons/ic-accessibility.svg';
import HelpIcon from '../../icons/ic-help.svg';
import KeyboardIcon from '../../icons/ic-keyboard.svg';
import ListedIcon from '../../icons/ic-listed.svg';
import SecurityIcon from '../../icons/ic-security.svg';
import SettingsIcon from '../../icons/ic-settings.svg';
import StarIcon from '../../icons/ic-star.svg';
import ThemesIcon from '../../icons/ic-themes.svg';
import UserIcon from '../../icons/ic-user.svg';
import CopyIcon from '../../icons/ic-copy.svg';
import DownloadIcon from '../../icons/ic-download.svg';
import InfoIcon from '../../icons/ic-info.svg';

import { toDirective } from './utils';
import { FunctionalComponent } from 'preact';

const ICONS = {
  'pencil-off': PencilOffIcon,
  'rich-text': RichTextIcon,
  trash: TrashIcon,
  pin: PinIcon,
  unpin: UnpinIcon,
  archive: ArchiveIcon,
  unarchive: UnarchiveIcon,
  hashtag: HashtagIcon,
  'chevron-right': ChevronRightIcon,
  restore: RestoreIcon,
  close: CloseIcon,
  password: PasswordIcon,
  'trash-sweep': TrashSweepIcon,
  more: MoreIcon,
  tune: TuneIcon,
  accessibility: AccessibilityIcon,
  help: HelpIcon,
  keyboard: KeyboardIcon,
  listed: ListedIcon,
  security: SecurityIcon,
  settings: SettingsIcon,
  star: StarIcon,
  themes: ThemesIcon,
  user: UserIcon,
  copy: CopyIcon,
  download: DownloadIcon,
  info: InfoIcon,
};

export type IconType = keyof typeof ICONS;

type Props = {
  type: IconType;
  className?: string;
};

export const Icon: FunctionalComponent<Props> = ({ type, className = '' }) => {
  const IconComponent = ICONS[type];
  return <IconComponent className={`sn-icon ${className}`} />;
};

export const IconDirective = toDirective<Props>(Icon, {
  type: '@',
  className: '@',
});
