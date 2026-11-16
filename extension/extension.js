// SPDX-License-Identifier: GPL-2.0-or-later
// Command Shelf: an icon in the top bar, next to the clock, that lists your own commands by group and runs the one you pick
// in a terminal. The list is read again every time the menu opens, so a new script shows up without restarting anything.

import GObject from 'gi://GObject';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {scan} from './commands.js';

// The terminals tried, in order: the first one installed opens the command.
const TERMINALS = [
    ['xdg-terminal-exec'],
    ['ptyxis', '--'],
    ['gnome-terminal', '--'],
    ['kgx', '--'],
    ['konsole', '-e'],
    ['x-terminal-emulator', '-e'],
];

function terminal() {
    return TERMINALS.find(([program]) => GLib.find_program_in_path(program) !== null) ?? null;
}

// The command runs in a shell that waits for a key at the end, so its output stays on screen.
function run(command) {
    const prefix = terminal();

    if (prefix === null) {
        Main.notifyError('Command Shelf', 'No terminal found to run the command.');
        return;
    }

    const script = `${GLib.shell_quote(command.path)}; status=$?; echo; read -rsn1 -p "[${command.name} ended: $status] Press a key to close"`;

    try {
        GLib.spawn_async(null, [...prefix, 'bash', '-c', script], null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (error) {
        Main.notifyError('Command Shelf', `Could not open ${command.name}: ${error.message}`);
    }
}

const ShelfButton = GObject.registerClass(
class ShelfButton extends PanelMenu.Button {
    _init() {
        super._init(0.5, 'Command Shelf');

        this.add_child(new St.Icon({icon_name: 'utilities-terminal-symbolic', style_class: 'system-status-icon'}));
        this._generation = 0;

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._refresh().catch(error => logError(error, 'Command Shelf'));
        });

        this._showMessage('Open to list your commands');
    }

    _showMessage(text) {
        this.menu.removeAll();
        const item = new PopupMenu.PopupMenuItem(text, {reactive: false});
        this.menu.addMenuItem(item);
    }

    async _refresh() {
        const generation = ++this._generation;
        const commands = await scan();

        // The menu was closed and opened again while reading: the newer read draws it.
        if (generation !== this._generation)
            return;

        this.menu.removeAll();

        if (commands.length === 0) {
            this._showMessage('No commands yet: add a "# help-commands: <description>" line to a script in ~/.local/bin');
            return;
        }

        let group = null;

        for (const command of commands) {
            if (command.group !== group) {
                group = command.group;
                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(group));
            }

            this.menu.addMenuItem(this._itemFor(command));
        }
    }

    _itemFor(command) {
        const item = new PopupMenu.PopupBaseMenuItem();
        const box = new St.BoxLayout({vertical: true, x_expand: true});
        const name = new St.Label({text: command.name, style: 'font-weight: bold;'});
        const description = new St.Label({text: command.description, style: 'font-size: smaller; opacity: 0.7; max-width: 32em;'});

        description.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        name.y_align = Clutter.ActorAlign.CENTER;
        box.add_child(name);
        box.add_child(description);
        item.add_child(box);
        item.connect('activate', () => run(command));

        return item;
    }
});

export default class CommandShelfExtension extends Extension {
    enable() {
        this._button = new ShelfButton();
        // On the right side, just before the system menu: next to the clock with the default layout.
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
    }

    disable() {
        this._button?.destroy();
        this._button = null;
    }
}
