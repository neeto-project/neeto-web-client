import { FunctionComponent } from 'preact';
import { observer } from 'mobx-react-lite';
import { DecoratedInput } from '../../../components/DecoratedInput';
import { IconButton } from '../../../components/IconButton';
import { TwoFactorActivation } from '../../models';
import { Button } from '@/components/Button';
import {
  AuthAppInfoPopup,
  TwoFactorDialog,
  TwoFactorDialogButtons,
  TwoFactorDialogDescription,
  TwoFactorDialogLabel,
} from './utils';

export const ScanQRCode: FunctionComponent<{
  activation: TwoFactorActivation;
}> = observer(({ activation: act }) => {
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
        Step 1 of 4 - Scan QR code
      </TwoFactorDialogLabel>
      <TwoFactorDialogDescription>
        <div className="flex flex-row gap-3 items-center">
          <div className="w-25 h-25 flex items-center justify-center bg-info">
            QR code
          </div>
          <div className="flex-grow flex flex-col gap-2">
            <div className="flex flex-row gap-1 items-center">
              <div className="text-sm">
                ・Open your <b>authenticator app</b>.
              </div>
              <AuthAppInfoPopup />
            </div>
            <div className="flex flex-row items-center">
              <div className="text-sm flex-grow">
                ・<b>Scan this QR code</b> or <b>add this secret key</b>:
              </div>
              <div className="w-56">
                <DecoratedInput
                  disabled={true}
                  text={act.secretKey}
                  right={[copy]}
                />
              </div>
            </div>
          </div>
        </div>
      </TwoFactorDialogDescription>
      <TwoFactorDialogButtons>
        <Button className="min-w-20" type="normal" label="Cancel" />
        <Button className="min-w-20" type="primary" label="Next" />
      </TwoFactorDialogButtons>
    </TwoFactorDialog>
  );
});
