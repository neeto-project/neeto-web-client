import { FunctionComponent } from 'preact';
import {
  Title,
  Text,
  PreferencesGroup,
  PreferencesSegment,
} from '../../components';
import { Switch } from '../../../components/Switch';
import { observer } from 'mobx-react-lite';
import { DecoratedInput } from '../../../components/DecoratedInput';
import { IconButton } from '../../../components/IconButton';
import { ScanQRCode } from './ScanQRCode';
import { SaveSecretKey } from './SaveSecretKey';
import { Verification } from './Verification';
import { TwoFactorActivation, TwoFactorAuth } from './model';
import { downloadSecretKey } from './download-secret-key';

export const TwoFactorAuthView: FunctionComponent<{
  auth: TwoFactorAuth;
}> = observer(({ auth }) => (
  <PreferencesGroup>
    <PreferencesSegment>
      <div className="flex flex-row items-center">
        <div className="flex-grow flex flex-col">
          <Title>Two-factor authentication</Title>
          <Text>
            An extra layer of security when logging in to your account.
          </Text>
        </div>
        <Switch
          checked={auth.enabled !== false}
          onChange={() => auth.toggle2FA()}
        />
      </div>
    </PreferencesSegment>
    <PreferencesSegment>
      {auth.enabled && (
        <TwoFactorEnabledView
          secretKey={auth.enabled.secretKey}
          authCode={auth.enabled.authCode}
        />
      )}

      {auth.activation instanceof TwoFactorActivation && (
        <TwoFactorActivationView activation={auth.activation} />
      )}

      {auth.enabled === false && <TwoFactorDisabledView />}
    </PreferencesSegment>
  </PreferencesGroup>
));

const TwoFactorEnabledView: FunctionComponent<{
  secretKey: string;
  authCode: string;
}> = ({ secretKey, authCode }) => {
  const download = (
    <IconButton
      icon="download"
      onClick={() => {
        downloadSecretKey(secretKey);
      }}
    />
  );
  const copy = (
    <IconButton
      icon="copy"
      onClick={() => {
        navigator?.clipboard?.writeText(secretKey);
      }}
    />
  );
  const spinner = <div class="sk-spinner info w-8 h-3.5" />;
  return (
    <div className="flex flex-row gap-4">
      <div className="flex-grow flex flex-col">
        <Text>Secret Key</Text>
        <DecoratedInput
          disabled={true}
          right={[copy, download]}
          text={secretKey}
        />
      </div>
      <div className="w-30 flex flex-col">
        <Text>Authentication Code</Text>
        <DecoratedInput disabled={true} text={authCode} right={[spinner]} />
      </div>
    </div>
  );
};

const TwoFactorDisabledView: FunctionComponent = () => (
  <Text>
    Enabling two-factor authentication will sign you out of all other sessions.{' '}
    <a
      target="_blank"
      href="https://standardnotes.com/help/21/where-should-i-store-my-two-factor-authentication-secret-key"
    >
      Learn more
    </a>
  </Text>
);

export const TwoFactorActivationView: FunctionComponent<{
  activation: TwoFactorActivation;
}> = observer(({ activation: act }) => (
  <>
    {act.step === 'scan-qr-code' && <ScanQRCode activation={act} />}

    {act.step === 'save-secret-key' && <SaveSecretKey activation={act} />}

    {act.step === 'verification' && <Verification activation={act} />}
  </>
));
