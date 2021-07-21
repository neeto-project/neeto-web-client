import { observable } from 'mobx';
import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';
import { TwoFactorAuth } from './model';
import { TwoFactorAuthView } from './TwoFactorAuthView';

export const TwoFactorAuthWrapper: FunctionComponent = observer(() => {
  const auth = observable(new TwoFactorAuth());
  return <TwoFactorAuthView auth={auth} />;
});
