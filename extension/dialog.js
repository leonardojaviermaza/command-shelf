// SPDX-License-Identifier: GPL-2.0-or-later
// The window of «Add command…»: name, group, what it does and what it runs. The group is free text with the existing ones as
// buttons to pick from; a name that is not one of them is a new group, and the window says so while you type.
//
// And the window that asks for the parameters a command declares (# help-commands-arg:) before running it: one field each,
// starting with its value if it has one, its proposed values as buttons; a required one left empty stops it from running.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {argvFor, createCommand, isKnownGroup} from './commands.js';
import {says} from './texts.js';

export const AddCommandDialog = GObject.registerClass(
class AddCommandDialog extends ModalDialog.ModalDialog {
    _init(groups, onAdded) {
        super._init({styleClass: 'command-shelf-dialog', destroyOnClose: true});

        this._groups = groups;
        this._onAdded = onAdded;

        const box = new St.BoxLayout({vertical: true, style: 'spacing: 8px; min-width: 28em;'});
        box.add_child(new St.Label({text: says('addTitle'), style: 'font-weight: bold; font-size: larger; margin-bottom: 6px;'}));

        this._name = this._field(box, says('name'), says('namePlaceholder'));
        this._group = this._field(box, says('group'), says('groupPlaceholder'));

        if (groups.length > 0) {
            const chips = new St.BoxLayout({style: 'spacing: 6px;'});
            for (const group of groups) {
                const chip = new St.Button({label: group, style_class: 'button', can_focus: true});
                chip.connect('clicked', () => this._group.set_text(group));
                chips.add_child(chip);
            }
            box.add_child(chips);
        }

        this._groupHint = new St.Label({text: '', style: 'font-size: smaller; opacity: 0.8;'});
        box.add_child(this._groupHint);
        this._group.clutter_text.connect('text-changed', () => this._sayGroup());

        this._description = this._field(box, says('description'), says('descriptionPlaceholder'));
        this._command = this._field(box, says('command'), says('commandPlaceholder'));

        this._error = new St.Label({text: '', style: 'color: #e01b24; font-size: smaller;'});
        this._error.clutter_text.line_wrap = true;
        box.add_child(this._error);

        this.contentLayout.add_child(box);

        this.setButtons([
            {label: says('cancel'), action: () => this.close(), key: Clutter.KEY_Escape},
            {label: says('save'), action: () => this._save(), default: true},
        ]);

        this.setInitialKeyFocus(this._name);
    }

    _field(box, label, placeholder) {
        box.add_child(new St.Label({text: label, style: 'font-size: smaller; margin-top: 4px;'}));
        const entry = new St.Entry({hint_text: placeholder, can_focus: true, x_expand: true});
        entry.clutter_text.connect('activate', () => this._save());
        box.add_child(entry);
        return entry;
    }

    _sayGroup() {
        const group = this._group.get_text().trim();

        if (group === '')
            this._groupHint.set_text('');
        else if (isKnownGroup(group, this._groups))
            this._groupHint.set_text(says('knownGroup', this._groups.find(each => each.toLowerCase() === group.toLowerCase())));
        else
            this._groupHint.set_text(says('newGroup', group));
    }

    _save() {
        const typed = this._group.get_text().trim();
        // An existing group typed with other capitals keeps its own spelling: two groups that differ only in case would be confusing.
        const group = this._groups.find(each => each.toLowerCase() === typed.toLowerCase()) ?? typed;

        try {
            const name = this._name.get_text().trim();
            createCommand({
                name,
                group,
                description: this._description.get_text(),
                command: this._command.get_text(),
            }, says);
            this.close();
            this._onAdded(name, group);
        } catch (error) {
            this._error.set_text(error.message);
        }
    }
});

export const ArgsDialog = GObject.registerClass(
class ArgsDialog extends ModalDialog.ModalDialog {
    _init(command, onRun) {
        super._init({styleClass: 'command-shelf-dialog', destroyOnClose: true});

        this._command = command;
        this._onRun = onRun;

        const box = new St.BoxLayout({vertical: true, style: 'spacing: 8px; min-width: 28em;'});
        box.add_child(new St.Label({text: command.name, style: 'font-weight: bold; font-size: larger;'}));

        const description = new St.Label({text: command.description, style: 'opacity: 0.8; margin-bottom: 6px;'});
        description.clutter_text.line_wrap = true;
        box.add_child(description);

        this._entries = command.args.map(arg => this._field(box, arg));

        this._error = new St.Label({text: '', style: 'color: #e01b24; font-size: smaller;'});
        this._error.clutter_text.line_wrap = true;
        box.add_child(this._error);

        this.contentLayout.add_child(box);

        this.setButtons([
            {label: says('cancel'), action: () => this.close(), key: Clutter.KEY_Escape},
            {label: says('run'), action: () => this._run(), default: true},
        ]);

        this.setInitialKeyFocus(this._entries[0]);
    }

    _field(box, arg) {
        const label = arg.required ? arg.name : says('optional', arg.name);
        box.add_child(new St.Label({text: label, style: 'font-size: smaller; margin-top: 4px;'}));

        const entry = new St.Entry({text: arg.value, hint_text: arg.help, can_focus: true, x_expand: true});
        entry.clutter_text.connect('activate', () => this._run());
        box.add_child(entry);

        if (arg.choices.length > 1) {
            const chips = new St.BoxLayout({style: 'spacing: 6px;'});
            for (const choice of arg.choices) {
                const chip = new St.Button({label: choice, style_class: 'button', can_focus: true});
                chip.connect('clicked', () => entry.set_text(choice));
                chips.add_child(chip);
            }
            box.add_child(chips);
        }

        if (arg.help !== '' && arg.value !== '') {
            // With a value already written the hint does not show: the help goes under the field.
            const help = new St.Label({text: arg.help, style: 'font-size: smaller; opacity: 0.7;'});
            help.clutter_text.line_wrap = true;
            box.add_child(help);
        }

        return entry;
    }

    _run() {
        const {argv, missing} = argvFor(this._command.args, this._entries.map(entry => entry.get_text()));

        if (missing.length > 0) {
            this._error.set_text(says('missingArgs', missing.join(', ')));
            this._entries[this._command.args.findIndex(arg => arg.name === missing[0])].grab_key_focus();
            return;
        }

        this.close();
        this._onRun(argv);
    }
});
