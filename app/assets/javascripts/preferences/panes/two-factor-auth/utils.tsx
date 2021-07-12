import { ComponentChildren, FunctionComponent } from 'preact';
import { IconButton } from '../../../components/IconButton';
import {
  AlertDialog,
  AlertDialogDescription,
  AlertDialogLabel,
} from '@reach/alert-dialog';
import { useEffect, useRef, useState } from 'preact/hooks';

// Temporary implementation until integration
export function downloadSecretKey(text: string) {
  const link = document.createElement('a');
  const blob = new Blob([text], {
    type: 'text/plain;charset=utf-8',
  });
  link.href = window.URL.createObjectURL(blob);
  link.setAttribute('download', 'secret_key.txt');
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(link.href);
}

export const AuthAppInfoPopup: FunctionComponent = () => {
  const [shown, setShow] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const dismiss = () => setShow(false);
    document.addEventListener('mousedown', dismiss);
    return () => {
      document.removeEventListener('mousedown', dismiss);
    };
  }, [ref]);

  return (
    <div className="relative">
      <IconButton
        icon="info"
        className="mt-1"
        onClick={() => {
          setShow(!shown);
        }}
      />
      {shown && (
        <div
          className={`bg-black color-white text-center rounded shadow-overlay \ 
        py-1.5 px-2 absolute w-103 top-neg-10 left-neg-51`}
        >
          Some apps, like Google Authenticator, do not back up and restore your
          secret keys if you lose your device or get a new one.
        </div>
      )}
    </div>
  );
};

export const TwoFactorDialog: FunctionComponent<{
  children: ComponentChildren;
}> = ({ children }) => {
  // TODO discover what this does
  const ldRef = useRef<HTMLButtonElement>();

  return (
    <AlertDialog leastDestructiveRef={ldRef}>
      <div className="sn-component w-160">
        <div className="w-160 bg-default rounded shadow-overlay">
          {children}
        </div>
      </div>
    </AlertDialog>
  );
};

export const TwoFactorDialogLabel: FunctionComponent<{ close: () => void }> = ({
  children,
}) => (
  <AlertDialogLabel className="">
    <div className="px-4 py-4 flex flex-row">
      <div className="flex-grow color-black text-lg-sm-lh font-bold">
        {children}
      </div>
      <IconButton
        className="color-grey-1 h-5 w-5"
        icon="close"
        onClick={close}
      />
    </div>
    <hr className="h-1px bg-border no-border m-0" />
  </AlertDialogLabel>
);

export const TwoFactorDialogDescription: FunctionComponent = ({ children }) => (
  <AlertDialogDescription className="px-4 py-4">
    {children}
  </AlertDialogDescription>
);

export const TwoFactorDialogButtons: FunctionComponent = ({ children }) => (
  <>
    <hr className="h-1px bg-border no-border m-0" />
    <div className="px-4 py-4 flex flex-row justify-end gap-3">{children}</div>
  </>
);
