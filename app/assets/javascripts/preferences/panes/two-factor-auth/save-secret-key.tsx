import { Button } from '@/components/Button';
import { IconButton } from '@/components/IconButton';
import { TwoFactorActivation } from '@/preferences/models';
import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';
import {
  downloadSecretKey,
  TwoFactorDialog,
  TwoFactorDialogLabel,
  TwoFactorDialogDescription,
  TwoFactorDialogButtons,
} from './utils';

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
          <div className="text-sm">
            ・<b>Save your secret key</b> somewhere safe:
          </div>
          <div className="text-sm">
            ・You can use this key to generate codes if you lose access to your
            authenticator app. Learn more
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
