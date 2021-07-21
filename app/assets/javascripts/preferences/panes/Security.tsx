import { FunctionComponent } from 'preact';
import { PreferencesPane } from '../components';
import { TwoFactorAuthWrapper } from './two-factor-auth';

export const Security: FunctionComponent = () => (
  <PreferencesPane>
    <TwoFactorAuthWrapper />
  </PreferencesPane>
);
