import { FunctionComponent } from 'preact';

const base = `rounded px-4 py-1.75 font-bold text-sm fit-content cursor-pointer`;

const normal = `${base} bg-default color-text border-solid border-gray-300 border-1 \
focus:bg-contrast hover:bg-contrast`;
const primary = `${base} no-border bg-info color-info-contrast hover:brightness-130 \
focus:brightness-130`;

export const Button: FunctionComponent<{
  className?: string;
  type: 'normal' | 'primary';
  label: string;
}> = ({ type, label, className = '' }) => {
  const buttonClass = type === 'primary' ? primary : normal;
  return <button className={`${buttonClass} ${className}`}>{label}</button>;
};
