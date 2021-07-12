import { TwoFactorAuth } from '../../models';
import { observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';
import { TwoFactorAuthView } from './view';

export const TwoFactorAuthWrapper: FunctionComponent = observer(() => {
  const tfAuth = observable(new TwoFactorAuth());
  return <TwoFactorAuthView tfAuth={tfAuth} />;
});
