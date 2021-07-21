import { TwoFactorActivation } from '@/preferences/models';
import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';

export const EmailRecovery: FunctionComponent<{
  activation: TwoFactorActivation;
}> = observer(({ activation }) => <></>);
