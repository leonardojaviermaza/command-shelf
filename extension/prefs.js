// SPDX-License-Identifier: GPL-2.0-or-later
// The settings of Command Shelf (the gear in Extensions): whether the groups start folded or open.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const spanish = GLib.get_language_names().some(name => name.startsWith('es'));
const text = spanish
    ? {title: 'Menú', fold: 'Grupos plegados', foldSub: 'Cada grupo arranca cerrado y se abre con un clic. Apagado: todos abiertos.'}
    : {title: 'Menu', fold: 'Folded groups', foldSub: 'Each group starts closed and opens with a click. Off: all of them open.'};

export default class CommandShelfPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: text.title});
        const row = new Adw.SwitchRow({title: text.fold, subtitle: text.foldSub});

        settings.bind('groups-collapsed', row, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(row);
        page.add(group);
        window.add(page);
    }
}
