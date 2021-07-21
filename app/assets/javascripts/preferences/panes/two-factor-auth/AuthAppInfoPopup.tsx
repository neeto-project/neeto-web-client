import { IconButton } from '@/components/IconButton';
import { FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'react';

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
