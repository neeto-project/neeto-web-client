/// <reference types="angular" />
import { ComponentGroup } from './component_group';
import { EditorGroup } from '@/ui_models/editor_group';
import { PasswordWizardType } from '@/types';
import { SNApplication, Challenge, ProtectedAction } from 'snjs';
import { DesktopManager, LockManager, ArchiveManager, NativeExtManager, StatusManager, ThemeManager, PreferencesManager, KeyboardManager } from '@/services';
import { AppState } from '@/ui_models/app_state';
import { Bridge } from '@/services/bridge';
declare type WebServices = {
    appState: AppState;
    desktopService: DesktopManager;
    lockService: LockManager;
    archiveService: ArchiveManager;
    nativeExtService: NativeExtManager;
    statusService: StatusManager;
    themeService: ThemeManager;
    prefsService: PreferencesManager;
    keyboardService: KeyboardManager;
};
export declare class WebApplication extends SNApplication {
    private $compile?;
    private scope?;
    private onDeinit?;
    private webServices;
    private currentAuthenticationElement?;
    editorGroup: EditorGroup;
    componentGroup: ComponentGroup;
    constructor($compile: ng.ICompileService, $timeout: ng.ITimeoutService, scope: ng.IScope, onDeinit: (app: WebApplication) => void, bridge: Bridge);
    /** @override */
    deinit(): void;
    setWebServices(services: WebServices): void;
    getAppState(): AppState;
    getDesktopService(): DesktopManager;
    getLockService(): LockManager;
    getArchiveService(): ArchiveManager;
    getNativeExtService(): NativeExtManager;
    getStatusService(): StatusManager;
    getThemeService(): ThemeManager;
    getPrefsService(): PreferencesManager;
    getKeyboardService(): KeyboardManager;
    checkForSecurityUpdate(): Promise<boolean>;
    presentPasswordWizard(type: PasswordWizardType): void;
    promptForChallenge(challenge: Challenge): void;
    performProtocolUpgrade(): Promise<void>;
    presentPrivilegesModal(action: ProtectedAction, onSuccess?: any, onCancel?: any): Promise<void>;
    presentPrivilegesManagementModal(): void;
    authenticationInProgress(): boolean;
    presentPasswordModal(callback: () => void): void;
    presentRevisionPreviewModal(uuid: string, content: any): void;
}
export {};
