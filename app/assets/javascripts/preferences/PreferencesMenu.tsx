import { observer } from 'mobx-react-lite';
import { FunctionComponent } from 'preact';
import { MenuItem } from './components';
import { PreferencesMenu } from './models/preferences';

export const PreferencesMenuView: FunctionComponent<{
  preferences: PreferencesMenu;
}> = observer(({ preferences }) => (
  <div className="min-w-55 overflow-y-auto flex flex-col px-3 py-6">
    {preferences.menuItems.map((pref) => (
      <MenuItem
        key={pref.id}
        iconType={pref.icon}
        label={pref.label}
        selected={pref.selected}
        onClick={() => preferences.selectPane(pref.id)}
      />
    ))}
  </div>
));
