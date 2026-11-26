// SPDX-License-Identifier: GPL-2.0-or-later
// What the extension says, in English, or in Spanish when the system is. A handful of texts: no gettext for so few.

import GLib from 'gi://GLib';

const TEXTS = {
    en: {
        empty: 'No commands yet: add one below, or put a "# help-commands: <description>" line in a script of ~/.local/bin',
        add: 'Add command…',
        loading: 'Reading your commands…',
        edit: 'Edit',
        addTitle: 'Add a command',
        name: 'Name',
        namePlaceholder: 'vpn-up',
        group: 'Group',
        groupPlaceholder: 'Work',
        description: 'What it does',
        descriptionPlaceholder: 'Connects the work VPN.',
        command: 'What it runs',
        commandPlaceholder: 'nmcli connection up "Work"',
        newGroup: 'New group: "%s" will be created',
        knownGroup: 'Goes under "%s"',
        cancel: 'Cancel',
        save: 'Add',
        invalidName: 'The name can only have letters, digits, dots, dashes and underscores, and starts with a letter or digit.',
        nameTaken: 'There is already a command called "%s".',
        missingField: 'Every field is needed.',
        added: '"%s" added to %s.',
        noTerminal: 'No terminal found to run the command.',
        cannotOpen: 'Could not open %s: %s',
        ended: '%s ended: %s. Press a key to close',
        run: 'Run',
        optional: '%s (optional)',
        missingArgs: 'Missing: %s.',
    },
    es: {
        empty: 'Todavía no hay comandos: agregá uno abajo, o poné una línea "# help-commands: <descripción>" en un script de ~/.local/bin',
        add: 'Agregar comando…',
        loading: 'Leyendo tus comandos…',
        edit: 'Editar',
        addTitle: 'Agregar un comando',
        name: 'Nombre',
        namePlaceholder: 'vpn-up',
        group: 'Grupo',
        groupPlaceholder: 'Trabajo',
        description: 'Qué hace',
        descriptionPlaceholder: 'Conecta la VPN del trabajo.',
        command: 'Qué ejecuta',
        commandPlaceholder: 'nmcli connection up "Trabajo"',
        newGroup: 'Grupo nuevo: se va a crear «%s»',
        knownGroup: 'Va en «%s»',
        cancel: 'Cancelar',
        save: 'Agregar',
        invalidName: 'El nombre sólo puede tener letras, números, puntos, guiones y guiones bajos, y empieza con letra o número.',
        nameTaken: 'Ya hay un comando que se llama «%s».',
        missingField: 'Hacen falta todos los campos.',
        added: '«%s» agregado en %s.',
        noTerminal: 'No encontré una terminal para ejecutar el comando.',
        cannotOpen: 'No pude abrir %s: %s',
        ended: '%s terminó: %s. Apretá una tecla para cerrar',
        run: 'Ejecutar',
        optional: '%s (opcional)',
        missingArgs: 'Falta: %s.',
    },
};

const language = GLib.get_language_names().some(name => name.startsWith('es')) ? 'es' : 'en';

/** The text of a key, with each %s replaced by the next argument. */
export function says(key, ...args) {
    let text = TEXTS[language][key] ?? TEXTS.en[key] ?? key;

    for (const arg of args)
        text = text.replace('%s', String(arg));

    return text;
}
