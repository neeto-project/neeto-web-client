import { Button } from '@/components/Button';
import { DecoratedInput } from '@/components/DecoratedInput';
import { IconButton } from '@/components/IconButton';
import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';
import { downloadSecretKey } from './download-secret-key';
import { TwoFactorActivation } from './model';
import {
  TwoFactorDialog,
  TwoFactorDialogLabel,
  TwoFactorDialogDescription,
  TwoFactorDialogButtons,
} from './TwoFactorDialog';

export const SaveSecretKey: FunctionComponent<{
  activation: TwoFactorActivation;
}> = observer(({ activation: act }) => {
  const download = (
    <IconButton
      icon="download"
      onClick={() => {
        downloadSecretKey(act.secretKey);
      }}
    />
  );
  const copy = (
    <IconButton
      icon="copy"
      onClick={() => {
        navigator?.clipboard?.writeText(act.secretKey);
      }}
    />
  );
  return (
    <TwoFactorDialog>
      <TwoFactorDialogLabel close={() => {}}>
        Step 2 of 4 - Save secret key
      </TwoFactorDialogLabel>
      <TwoFactorDialogDescription>
        <div className="flex-grow flex flex-col gap-2">
          <div className="flex flex-row items-center gap-1">
            <div className="text-sm">
              ・<b>Save your secret key</b>{' '}
              <a
                target="_blank"
                href="https://standardnotes.com/help/21/where-should-i-store-my-two-factor-authentication-secret-key"
              >
                somewhere safe
              </a>
              :
            </div>
            <DecoratedInput
              disabled={true}
              right={[copy, download]}
              text={act.secretKey}
            />
          </div>
          <div className="text-sm">
            ・You can use this key to generate codes if you lose access to your
            authenticator app.{' '}
            <a
              target="_blank"
              href="https://standardnotes.com/help/22/what-happens-if-i-lose-my-2fa-device-and-my-secret-key"
            >
              Learn more
            </a>
          </div>
        </div>
      </TwoFactorDialogDescription>
      <TwoFactorDialogButtons>
        <Button className="min-w-20" type="normal" label="Back" />
        <Button className="min-w-20" type="primary" label="Next" />
      </TwoFactorDialogButtons>
    </TwoFactorDialog>
  );
});
