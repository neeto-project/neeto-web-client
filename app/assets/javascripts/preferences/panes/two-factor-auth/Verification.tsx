import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';
import { TwoFactorActivation } from './model';

export const Verification: FunctionComponent<{
  activation: TwoFactorActivation;
}> = observer(({ activation }) => <></>);
