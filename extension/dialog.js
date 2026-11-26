// SPDX-License-Identifier: GPL-2.0-or-later
// The window of «Add command…»: name, group, what it does and what it runs. The group is free text with the existing ones as
// buttons to pick from; a name that is not one of them is a new group, and the window says so while you type.
//
// And the window that asks for the parameters a command declares (# help-commands-arg:) before running it: one field each,
// starting with its value if it has one, its proposed values as buttons; a required one left empty stops it from running.
//
// And the window of ✎: the same fields of a command, filled, to change what it does, its group and its parameters. Saving
// rewrites only those header lines. For one owned by root only the group changes, in the groups file; «Open in the editor»
// opens the raw file.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {argvFor, createCommand, formatArg, isKnownGroup, saveCommand} from './commands.js';
import {says} from './texts.js';

// The existing groups as buttons under the group field, and a line that says whether what is typed is one of them or a new one.
function addGroupPicker(box, entry, groups) {
    if (groups.length > 0) {
        const chips = new St.BoxLayout({style: 'spacing: 6px;'});
        for (const group of groups) {
            const chip = new St.Button({label: group, style_class: 'button', can_focus: true});
            chip.connect('clicked', () => entry.set_text(group));
            chips.add_child(chip);
        }
        box.add_child(chips);
    }

    const hint = new St.Label({text: '', style: 'font-size: smaller; opacity: 0.8;'});
    box.add_child(hint);

    const say = () => {
        const group = entry.get_text().trim();

        if (group === '')
            hint.set_text('');
        else if (isKnownGroup(group, groups))
            hint.set_text(says('knownGroup', groups.find(each => each.toLowerCase() === group.toLowerCase())));
        else
            hint.set_text(says('newGroup', group));
    };
    entry.clutter_text.connect('text-changed', say);
    say();
}

// An existing group typed with other capitals keeps its own spelling: two groups that differ only in case would be confusing.
function spelled(entry, groups) {
    const typed = entry.get_text().trim();
    return groups.find(each => each.toLowerCase() === typed.toLowerCase()) ?? typed;
}

function errorLabel(box) {
    const error = new St.Label({text: '', style: 'color: #e01b24; font-size: smaller;'});
    error.clutter_text.line_wrap = true;
    box.add_child(error);
    return error;
}

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
        addGroupPicker(box, this._group, groups);

        this._description = this._field(box, says('description'), says('descriptionPlaceholder'));
        this._command = this._field(box, says('command'), says('commandPlaceholder'));
        this._error = errorLabel(box);

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

    _save() {
        const group = spelled(this._group, this._groups);

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

export const EditCommandDialog = GObject.registerClass(
class EditCommandDialog extends ModalDialog.ModalDialog {
    _init(command, groups, onSaved, openRaw) {
        super._init({styleClass: 'command-shelf-dialog', destroyOnClose: true});

        this._commandItem = command;
        this._groups = groups;
        this._onSaved = onSaved;
        this._rows = [];

        // Owned by root: only the group, and only if its header does not give one (then the groups file would not count).
        const groupOnly = !command.writable;
        const nothing = groupOnly && command.headerGroup !== '';

        const box = new St.BoxLayout({vertical: true, style: 'spacing: 8px; min-width: 40em;'});
        box.add_child(new St.Label({text: command.name, style: 'font-weight: bold; font-size: larger;'}));
        box.add_child(new St.Label({text: command.path, style: 'font-size: smaller; opacity: 0.7; margin-bottom: 6px;'}));

        if (groupOnly) {
            const note = new St.Label({text: says(nothing ? 'readOnly' : 'rootNote'), style: 'font-size: smaller;'});
            note.clutter_text.line_wrap = true;
            box.add_child(note);
        }

        this._description = this._field(box, says('description'), command.description, !groupOnly);
        this._group = this._field(box, says('group'), command.group, !nothing);
        if (!nothing)
            addGroupPicker(box, this._group, groups);

        box.add_child(new St.Label({text: says('params'), style: 'font-size: smaller; margin-top: 4px;'}));
        if (groupOnly) {
            const lines = command.args.map(arg => formatArg(arg)).join('\n') || says('noParams');
            box.add_child(new St.Label({text: lines, style: 'font-family: monospace; opacity: 0.8;'}));
        } else {
            this._rowsBox = new St.BoxLayout({vertical: true, style: 'spacing: 6px;'});
            box.add_child(this._rowsBox);
            for (const arg of command.args)
                this._addRow(arg);

            const add = new St.Button({label: says('addParam'), style_class: 'button', can_focus: true, x_align: Clutter.ActorAlign.START});
            add.connect('clicked', () => this._addRow({name: '', required: true, choices: [], help: ''}).name.grab_key_focus());
            box.add_child(add);
        }

        this._error = errorLabel(box);
        this.contentLayout.add_child(box);

        const buttons = [
            {label: says('openRaw'), action: () => {
                this.close();
                openRaw();
            }},
            {label: says('cancel'), action: () => this.close(), key: Clutter.KEY_Escape},
        ];
        if (!nothing)
            buttons.push({label: says('saveEdit'), action: () => this._save(), default: true});
        this.setButtons(buttons);

        this.setInitialKeyFocus(groupOnly ? this._group : this._description);
    }

    _field(box, label, text, editable) {
        box.add_child(new St.Label({text: label, style: 'font-size: smaller; margin-top: 4px;'}));
        const entry = new St.Entry({text, can_focus: editable, x_expand: true});
        entry.clutter_text.editable = editable;
        if (editable)
            entry.clutter_text.connect('activate', () => this._save());
        else
            entry.opacity = 160;
        box.add_child(entry);
        return entry;
    }

    // One parameter: its name, its proposed values ("a|b"), its help, whether it is required, and a button to take it out.
    _addRow(arg) {
        const line = new St.BoxLayout({style: 'spacing: 6px;'});
        const entry = (text, hint, style) => {
            const each = new St.Entry({text, hint_text: hint, can_focus: true, style});
            each.clutter_text.connect('activate', () => this._save());
            line.add_child(each);
            return each;
        };

        const row = {
            line,
            name: entry(arg.name, says('paramName'), 'width: 8em;'),
            choices: entry(arg.choices.join('|'), says('paramChoices'), 'width: 9em;'),
            help: entry(arg.help, says('paramHelp'), ''),
        };
        row.help.x_expand = true;

        row.required = new St.Button({style_class: 'button', toggle_mode: true, checked: arg.required, can_focus: true});
        const sayRequired = () => row.required.set_label(says(row.required.checked ? 'required' : 'optionalShort'));
        row.required.connect('notify::checked', sayRequired);
        sayRequired();
        line.add_child(row.required);

        const remove = new St.Button({
            child: new St.Icon({icon_name: 'list-remove-symbolic', icon_size: 16}),
            style_class: 'button',
            accessible_name: says('removeParam'),
            can_focus: true,
        });
        remove.connect('clicked', () => {
            this._rows.splice(this._rows.indexOf(row), 1);
            line.destroy();
        });
        line.add_child(remove);

        this._rows.push(row);
        this._rowsBox.add_child(line);
        return row;
    }

    _save() {
        const command = this._commandItem;
        const args = this._rows.map(row => ({
            name: row.name.get_text().trim(),
            required: row.required.checked,
            choices: row.choices.get_text().split('|').map(each => each.trim()).filter(each => each !== ''),
            help: row.help.get_text().trim(),
        }));
        const group = spelled(this._group, this._groups);

        try {
            saveCommand(command, {description: this._description.get_text(), group, args: command.writable ? args : command.args}, says);
            this.close();
            this._onSaved(group);
        } catch (error) {
            this._error.set_text(error.message);
        }
    }
});
