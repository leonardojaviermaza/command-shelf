// SPDX-License-Identifier: GPL-2.0-or-later
// The window of «Add command…»: name, group, what it does and what it runs. The group is free text with the existing ones as
// buttons to pick from; a name that is not one of them is a new group, and the window says so while you type.

import GObject from 'gi://GObject';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as ModalDialog from 'resource:///org/gnome/shell/ui/modalDialog.js';

import {createCommand, isKnownGroup} from './commands.js';
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
