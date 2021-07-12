import { FunctionComponent } from 'preact';

export const Title: FunctionComponent = ({ children }) => (
  <h2 className="text-base m-0 mb-1">{children}</h2>
);

export const Subtitle: FunctionComponent = ({ children }) => (
  <h4 className="font-medium text-sm m-0 mb-1">{children}</h4>
);

export const Text: FunctionComponent = ({ children }) => (
  <p className="text-xs">{children}</p>
);

const buttonClasses = `block bg-default color-text rounded border-solid \
border-1 border-gray-300 px-4 py-1.75 font-bold text-sm fit-content mt-3 \
focus:bg-contrast hover:bg-contrast `;

export const LinkButton: FunctionComponent<{ label: string; link: string }> = ({
  label,
  link,
}) => (
  <a target="_blank" className={buttonClasses} href={link}>
    {label}
  </a>
);
