import { action, makeAutoObservable, observable } from 'mobx';

function getNewAuthCode() {
  const MIN = 100000;
  const MAX = 999999;
  const code = Math.floor(Math.random() * (MAX - MIN) + MIN);
  return code.toString();
}

const activationSteps = [
  'scan-qr-code',
  'save-secret-key',
  'email-recovery',
  'verification',
] as const;

type ActivationStep = typeof activationSteps[number];

export class TwoFactorActivation {
  public readonly type = 'two-factor-activation' as const;

  private _step: ActivationStep;

  private _secretKey: string;
  private _authCode: string;
  private _2FAVerification: 'none' | 'invalid' | 'valid' = 'none';

  constructor(
    private _cancelActivation: () => void,
    private _enable2FA: (secretKey: string) => void
  ) {
    this._secretKey = 'FHJJSAJKDASKW43KJS';
    this._authCode = getNewAuthCode();
    this._step = 'save-secret-key';

    makeAutoObservable<
      TwoFactorActivation,
      '_secretKey' | '_authCode' | '_step' | '_enable2FAVerification'
    >(this, {
      _secretKey: observable,
      _authCode: observable,
      _step: observable,
      _enable2FAVerification: observable,
    });
  }

  get secretKey() {
    return this._secretKey;
  }

  get authCode() {
    return this._authCode;
  }

  get step() {
    return this._step;
  }

  get enable2FAVerification() {
    return this._2FAVerification;
  }

  cancelActivation() {
    this._cancelActivation;
  }

  nextScanQRCode() {
    this._step = 'save-secret-key';
  }

  backSaveSecretKey() {
    this._step = 'scan-qr-code';
  }

  nextSaveSecretKey() {
    this._step = 'verification';
  }

  backVerification() {
    this._step = 'save-secret-key';
  }

  enable2FA(secretKey: string, authCode: string) {
    if (secretKey === this._secretKey && authCode === this._authCode) {
      this._2FAVerification = 'valid';
      this._enable2FA(secretKey);
      return;
    }

    this._2FAVerification = 'invalid';
  }
}

export class TwoFactorEnabled {
  public readonly type = 'enabled' as const;
  private _secretKey: string;
  private _authCode: string;

  constructor(secretKey: string) {
    this._secretKey = secretKey;
    this._authCode = getNewAuthCode();

    makeAutoObservable<TwoFactorEnabled, '_secretKey' | '_authCode'>(this, {
      _secretKey: observable,
      _authCode: observable,
    });
  }

  get secretKey() {
    return this._secretKey;
  }

  get authCode() {
    return this._authCode;
  }

  refreshAuthCode() {
    this._authCode = getNewAuthCode();
  }
}

export class TwoFactorAuth {
  private _status:
    | TwoFactorEnabled
    | TwoFactorActivation
    | 'two-factor-disabled' = new TwoFactorActivation(
    () => {},
    () => {}
  );

  constructor() {
    makeAutoObservable<TwoFactorAuth, '_status'>(this, {
      _status: observable,
    });
  }

  private startActivation() {
    const cancel = action(() => (this._status = 'two-factor-disabled'));
    const enable = action(
      (secretKey: string) => (this._status = new TwoFactorEnabled(secretKey))
    );
    this._status = new TwoFactorActivation(cancel, enable);
  }

  private deactivate2FA() {
    this._status = 'two-factor-disabled';
  }

  toggle2FA() {
    if (this._status === 'two-factor-disabled') this.startActivation();
    else this.deactivate2FA();
  }

  get enabled() {
    return (
      (this._status instanceof TwoFactorEnabled &&
        (this._status as TwoFactorEnabled)) ||
      false
    );
  }

  get activation() {
    return (
      (this._status instanceof TwoFactorActivation &&
        (this._status as TwoFactorActivation)) ||
      false
    );
  }
}
