import { RoundIconButton } from '@/components/RoundIconButton';
import { TitleBar, Title } from '@/components/TitleBar';
import { FunctionComponent } from 'preact';
import { HelpAndFeedback, Security } from './panes';
import { observer } from 'mobx-react-lite';
import { MenuItem } from './components';
import { PreferencesMenu } from './preferences-menu';

const PaneSelector: FunctionComponent<{
  prefs: PreferencesMenu;
}> = observer(({ prefs: menu }) => {
  switch (menu.selectedPaneId) {
    case 'general':
      return null;
    case 'account':
      return null;
    case 'appearance':
      return null;
    case 'security':
      return <Security />;
    case 'listed':
      return null;
    case 'shortcuts':
      return null;
    case 'accessibility':
      return null;
    case 'get-free-month':
      return null;
    case 'help-feedback':
      return <HelpAndFeedback />;
  }
});

const PreferencesCanvas: FunctionComponent<{
  preferences: PreferencesMenu;
}> = observer(({ preferences: prefs }) => (
  <div className="flex flex-row flex-grow min-h-0 justify-between">
    <PreferencesMenuView menu={prefs}></PreferencesMenuView>
    <PaneSelector prefs={prefs} />
  </div>
));

interface PreferencesViewProps {
  close: () => void;
}

const PreferencesView: FunctionComponent<{ close: () => void }> = observer(
  ({ close }) => {
    const prefs = new PreferencesMenu();
    return (
      <div className="sn-full-screen flex flex-col bg-contrast z-index-preferences">
        <TitleBar className="items-center justify-between">
          {/* div is added so flex justify-between can center the title */}
          <div className="h-8 w-8" />
          <Title className="text-lg">Your preferences for Standard Notes</Title>
          <RoundIconButton
            onClick={() => {
              close();
            }}
            type="normal"
            icon="close"
          />
        </TitleBar>
        <PreferencesCanvas preferences={prefs} />
      </div>
    );
  }
);

export interface PreferencesWrapperProps {
  appState: { preferences: { isOpen: boolean; closePreferences: () => void } };
}

export const PreferencesViewWrapper: FunctionComponent<PreferencesWrapperProps> =
  observer(({ appState }) => {
    if (!appState.preferences.isOpen) return null;
    return (
      <PreferencesView close={() => appState.preferences.closePreferences()} />
    );
  });

export const PreferencesMenuView: FunctionComponent<{
  menu: PreferencesMenu;
}> = observer(({ menu }) => (
  <div className="min-w-55 overflow-y-auto flex flex-col px-3 py-6">
    {menu.menuItems.map((pref) => (
      <MenuItem
        key={pref.id}
        iconType={pref.icon}
        label={pref.label}
        selected={pref.selected}
        onClick={() => menu.selectPane(pref.id)}
      />
    ))}
  </div>
));
