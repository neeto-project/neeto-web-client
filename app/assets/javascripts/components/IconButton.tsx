import { FunctionComponent } from 'preact';
import { Icon, IconType } from './Icon';

interface Props {
  /**
   * onClick - preventDefault is handled within the component
   */
  onClick: () => void;

  className?: string;

  icon: IconType;
}

/**
 * IconButton component with an icon
 * preventDefault is already handled within the component
 */
export const IconButton: FunctionComponent<Props> = ({
  onClick,
  className,
  icon,
}) => {
  const click = (e: MouseEvent) => {
    e.preventDefault();
    onClick();
  };
  return (
    <button
      className={`no-border cursor-pointer bg-transparent hover:brightness-130 p-0 ${
        className ?? ''
      }`}
      onClick={click}
    >
      <Icon type={icon} />
    </button>
  );
};
