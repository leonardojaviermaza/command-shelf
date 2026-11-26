// SPDX-License-Identifier: GPL-2.0-or-later
// Command Shelf: an icon in the top bar, next to the clock, that lists your own commands by group and runs the one you pick
// in a terminal. The list is read again every time the menu opens, so a new script shows up without restarting anything.
//
// Each group folds and unfolds with a click. Whether they start folded is a setting (the gear in Extensions); the ones you
// open stay open the next time, until you fold them. At the bottom, «Add command…» writes a new one in ~/.local/bin.

import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {scan, groupNames, groupsFile} from './commands.js';
import {AddCommandDialog, ArgsDialog} from './dialog.js';
import {says} from './texts.js';

const TITLE = 'Command Shelf';

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

// The command runs in a shell that waits for a key at the end, so its output stays on screen. Each argument reaches it as one,
// spaces and all: they go to bash as its positional parameters, never inside the script's text.
function run(command, argv = []) {
    const prefix = terminal();

    if (prefix === null) {
        Main.notifyError(TITLE, says('noTerminal'));
        return;
    }

    const ended = GLib.shell_quote(says('ended', command.name, '%s'));
    const script = `${GLib.shell_quote(command.path)} "$@"; status=$?; echo; printf ${ended} "$status"; read -rsn1`;

    try {
        GLib.spawn_async(null, [...prefix, 'bash', '-c', script, command.name, ...argv], null, GLib.SpawnFlags.SEARCH_PATH, null);
    } catch (error) {
        Main.notifyError(TITLE, says('cannotOpen', command.name, error.message));
    }
}

// Opens a file in the text editor: a script you own, or the groups file for the ones you cannot edit (owned by root).
function edit(command) {
    let path = command.path;

    if (!command.writable) {
        path = groupsFile();
        if (!GLib.file_test(path, GLib.FileTest.EXISTS)) {
            GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
            GLib.file_set_contents(path, '# <command>=<group>, one per line; "*=<group>" is the group of everything else.\n');
        }
    }

    try {
        const editor = Gio.AppInfo.get_default_for_type('text/plain', false);
        const file = Gio.File.new_for_path(path);
        const context = global.create_app_launch_context(0, -1);

        if (editor === null)
            Gio.AppInfo.launch_default_for_uri(file.get_uri(), context);
        else
            editor.launch([file], context);
    } catch (error) {
        Main.notifyError(TITLE, says('cannotOpen', path, error.message));
    }
}

const ShelfButton = GObject.registerClass(
class ShelfButton extends PanelMenu.Button {
    _init(settings) {
        super._init(0.5, TITLE);

        this._settings = settings;
        this._generation = 0;
        this.add_child(new St.Icon({icon_name: 'utilities-terminal-symbolic', style_class: 'system-status-icon'}));

        this.menu.connect('open-state-changed', (_menu, open) => {
            if (open)
                this._refresh().catch(error => logError(error, TITLE));
        });

        // GNOME Shell does not open an empty menu (`PopupMenu.open` returns on `isEmpty()`): it is filled right away, and the read
        // on each open refreshes what is already there.
        this.menu.addMenuItem(new PopupMenu.PopupMenuItem(says('loading'), {reactive: false}));
        this._refresh().catch(error => logError(error, TITLE));
    }

    async _refresh() {
        const generation = ++this._generation;
        const commands = await scan();

        // The menu was closed and opened again while reading: the newer read draws it.
        if (generation !== this._generation)
            return;

        this.menu.removeAll();

        if (commands.length === 0) {
            const empty = new PopupMenu.PopupMenuItem(says('empty'), {reactive: false});
            empty.label.clutter_text.line_wrap = true;
            empty.label.style = 'max-width: 28em;';
            this.menu.addMenuItem(empty);
        }

        const collapsed = this._settings.get_boolean('groups-collapsed');
        const open = new Set(this._settings.get_strv('open-groups'));

        for (const group of groupNames(commands)) {
            const section = new PopupMenu.PopupSubMenuMenuItem(group, false);

            for (const command of commands.filter(each => each.group === group))
                section.menu.addMenuItem(this._itemFor(command));

            section.menu.connect('open-state-changed', (_menu, isOpen) => this._remember(group, isOpen));
            this.menu.addMenuItem(section);

            if (!collapsed || open.has(group))
                section.setSubmenuShown(true);
        }

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const add = new PopupMenu.PopupImageMenuItem(says('add'), 'list-add-symbolic');
        add.connect('activate', () => {
            new AddCommandDialog(groupNames(commands), (name, group) => Main.notify(TITLE, says('added', name, group))).open();
        });
        this.menu.addMenuItem(add);
    }

    // With folded groups, the ones you open are kept open for the next time.
    _remember(group, isOpen) {
        if (!this._settings.get_boolean('groups-collapsed') || !this.menu.isOpen)
            return;

        const open = new Set(this._settings.get_strv('open-groups'));
        if (isOpen)
            open.add(group);
        else
            open.delete(group);
        this._settings.set_strv('open-groups', [...open].sort());
    }

    _itemFor(command) {
        const item = new PopupMenu.PopupBaseMenuItem();
        const box = new St.BoxLayout({vertical: true, x_expand: true});
        const name = new St.Label({text: command.name, style: 'font-weight: bold;'});
        const description = new St.Label({text: command.description, style: 'font-size: smaller; opacity: 0.7; max-width: 30em;'});

        description.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        box.add_child(name);
        box.add_child(description);
        item.add_child(box);

        const editButton = new St.Button({
            child: new St.Icon({icon_name: 'document-edit-symbolic', icon_size: 16}),
            style_class: 'button',
            style: 'padding: 4px; min-height: 0; min-width: 0;',
            accessible_name: says('edit'),
            can_focus: true,
            y_align: Clutter.ActorAlign.CENTER,
        });
        editButton.connect('clicked', () => {
            this.menu.close();
            edit(command);
        });
        item.add_child(editButton);

        // A command that declares its parameters asks for them first.
        item.connect('activate', () => {
            if (command.args.length > 0)
                new ArgsDialog(command, argv => run(command, argv)).open();
            else
                run(command);
        });

        return item;
    }
});

export default class CommandShelfExtension extends Extension {
    enable() {
        this._button = new ShelfButton(this.getSettings());
        // On the right side, just before the system menu: next to the clock with the default layout.
        Main.panel.addToStatusArea(this.uuid, this._button, 0, 'right');
    }

    disable() {
        this._button?.destroy();
        this._button = null;
    }
}
