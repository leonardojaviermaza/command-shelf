// SPDX-License-Identifier: GPL-2.0-or-later
// Finds the commands: the executables of the folders below whose first lines carry the help-commands header.
//
//   # help-commands: <what it does>
//   # help-commands-group: <group>        (optional)
//   # help-commands-arg: <name> <help>    (optional, one per parameter, in order: <name> is required, [name] optional,
//                                          <name=value> starts with that value, <name=a|b> proposes those)
//
// A command without its own group line takes the one ~/.config/help-commands/groups gives it ("<command>=<group>", one per
// line, "*=<group>" for the default); without either, the default group. The same rules as the `help-commands` CLI of this
// repository, so both always show the same list.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

Gio._promisify(Gio.File.prototype, 'enumerate_children_async');
Gio._promisify(Gio.FileEnumerator.prototype, 'next_files_async');
Gio._promisify(Gio.File.prototype, 'read_async');
Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async');
Gio._promisify(Gio.InputStream.prototype, 'close_async');
Gio._promisify(Gio.File.prototype, 'load_contents_async');

export const DEFAULT_GROUP = 'General';

const HEADER_BYTES = 4096;
// The description and the group go among the first five lines; the parameters, one line each, may come further down.
const HEADER_LINES = 5;
const ARG_LINES = 30;
const ARG_PREFIX = '# help-commands-arg:';
const ATTRIBUTES = 'standard::name,standard::type,access::can-execute,access::can-read,access::can-write';

/** The folder of your own commands, where a new one is written. */
export function ownFolder() {
    return GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin']);
}

/** The folders scanned, in order: the first one that has a name wins. */
export function folders() {
    return [ownFolder(), '/usr/local/bin'];
}

/** The file that gives a group to the commands that do not carry one. */
export function groupsFile() {
    return GLib.build_filenamev([GLib.get_user_config_dir(), 'help-commands', 'groups']);
}

/** A command's name is a file name you can type in a terminal: letters, digits, dots, dashes and underscores. */
export function validName(name) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

/** The groups the commands use, sorted: what a new command can pick from. */
export function groupNames(commands) {
    return [...new Set(commands.map(command => command.group))].sort((a, b) => a.localeCompare(b));
}

/** Whether a group is already one of them, ignoring case and the spaces of the borders. */
export function isKnownGroup(group, known) {
    const wanted = group.trim().toLowerCase();
    return known.some(each => each.toLowerCase() === wanted);
}

const oneLine = text => text.replaceAll(/\s*\n\s*/g, ' ').trim();

/** The text of a new command: the header the list reads, then what it runs. */
export function scriptFor({description, group, command}) {
    return [
        '#!/usr/bin/env bash',
        `# help-commands: ${oneLine(description)}`,
        `# help-commands-group: ${oneLine(group)}`,
        '',
        command.trim(),
        '',
    ].join('\n');
}

/** Whether a command with that name is already in one of the folders. */
export function exists(name) {
    return folders().some(path => Gio.File.new_for_path(GLib.build_filenamev([path, name])).query_exists(null));
}

/**
 * Writes a new command in ~/.local/bin, executable. Throws with a reason the menu shows if the name is not valid or is taken,
 * or if a field is empty.
 */
export function createCommand({name, group, description, command}, says) {
    const trimmed = name.trim();

    if (!validName(trimmed))
        throw new Error(says('invalidName'));
    if (exists(trimmed))
        throw new Error(says('nameTaken', trimmed));
    if (description.trim() === '' || command.trim() === '' || group.trim() === '')
        throw new Error(says('missingField'));

    GLib.mkdir_with_parents(ownFolder(), 0o755);
    const path = GLib.build_filenamev([ownFolder(), trimmed]);
    GLib.file_set_contents(path, scriptFor({description, group, command}));
    GLib.chmod(path, 0o755);

    return path;
}

/**
 * One parameter line, after its prefix: "<name> <help>" is a required one, "[name] <help>" an optional one. "<name=value>"
 * or "[name=value]" gives the value its field starts with, and "name=a|b|c" proposes several, starting with the first: they
 * are suggestions, any other value can be typed (checking it is the script's job). Null if it is none of those.
 */
export function parseArg(text) {
    const match = /^\s*(?:<([^<>]+)>|\[([^[\]]+)\])\s*(.*)$/.exec(text);

    if (match === null)
        return null;

    const inside = match[1] ?? match[2];
    const at = inside.indexOf('=');
    const name = (at < 0 ? inside : inside.slice(0, at)).trim();
    const choices = at < 0 ? [] : inside.slice(at + 1).split('|').map(each => each.trim()).filter(each => each !== '');

    return name === '' ? null : {name, required: match[1] !== undefined, value: choices[0] ?? '', choices, help: match[3].trim()};
}

/** One parameter as its header line writes it, after the prefix: the inverse of `parseArg`. */
export function formatArg({name, required, choices = [], help = ''}) {
    const inside = choices.length === 0 ? name.trim() : `${name.trim()}=${choices.map(each => each.trim()).join('|')}`;
    const text = required ? `<${inside}>` : `[${inside}]`;
    const said = oneLine(help);

    return said === '' ? text : `${text} ${said}`;
}

/**
 * The parameters as the edit window gives them back, checked: a name each, without the signs the syntax uses, and not twice;
 * no value with those signs either. Throws with the reason the window shows.
 */
export function checkArgs(args, says) {
    const names = new Set();

    for (const arg of args) {
        const name = arg.name.trim();

        if (name === '')
            throw new Error(says('argNameMissing'));
        if (/[<>[\]=|]/.test(name) || arg.choices.some(each => /[<>[\]|]/.test(each)))
            throw new Error(says('argSigns', name));
        if (names.has(name))
            throw new Error(says('argTwice', name));
        names.add(name);
    }
}

const DESCRIPTION_PREFIX = '# help-commands:';
const GROUP_PREFIX = '# help-commands-group:';

/**
 * A script with its header rewritten: the description, the group (unless `group` is null: then its line, or its absence, stays)
 * and the parameter lines, which replace the old ones where the first one was, or go under the group. Every other line stays
 * as it was. The script must already be one of ours (a description line among its first five lines).
 */
export function rewriteHeader(text, {description, group = null, args}) {
    const lines = text.split('\n');
    const head = lines.slice(0, HEADER_LINES);
    const descriptionAt = head.findIndex(each => each.startsWith(DESCRIPTION_PREFIX));

    if (descriptionAt < 0)
        throw new Error('not a help-commands script');

    lines[descriptionAt] = `${DESCRIPTION_PREFIX} ${oneLine(description)}`;

    if (group !== null) {
        const groupAt = head.findIndex(each => each.startsWith(GROUP_PREFIX));
        const groupLine = `${GROUP_PREFIX} ${oneLine(group)}`;

        if (groupAt >= 0) {
            lines[groupAt] = groupLine;
        } else if (descriptionAt + 1 < HEADER_LINES) {
            lines.splice(descriptionAt + 1, 0, groupLine);
        } else {
            // The description is the fifth line: the group under it would not be read. Both go up, under the #! line.
            const top = lines[0].startsWith('#!') ? 1 : 0;
            const [descriptionLine] = lines.splice(descriptionAt, 1);
            lines.splice(top, 0, descriptionLine, groupLine);
        }
    }

    const argLines = args.map(arg => `${ARG_PREFIX} ${formatArg(arg)}`);
    const oldAt = lines.slice(0, ARG_LINES).findIndex(each => each.startsWith(ARG_PREFIX));
    let at;

    if (oldAt >= 0) {
        at = oldAt;
        for (let i = Math.min(lines.length, ARG_LINES) - 1; i >= oldAt; i--) {
            if (lines[i].startsWith(ARG_PREFIX))
                lines.splice(i, 1);
        }
    } else {
        const top = lines.slice(0, HEADER_LINES + 1);
        at = Math.max(...[DESCRIPTION_PREFIX, GROUP_PREFIX].map(prefix => top.findIndex(each => each.startsWith(prefix)))) + 1;
    }

    lines.splice(at, 0, ...argLines);
    return lines.join('\n');
}

/** The groups file with `name=group` set: the line it had changes in place, or a new one goes at the end. */
export function setGroupLine(text, name, group) {
    const lines = text === '' ? [] : text.replace(/\n$/, '').split('\n');
    const line = `${name}=${oneLine(group)}`;
    const at = lines.findIndex(each => {
        const trimmed = each.trim();
        const equals = trimmed.indexOf('=');
        return !trimmed.startsWith('#') && equals > 0 && trimmed.slice(0, equals).trim() === name;
    });

    if (at >= 0)
        lines[at] = line;
    else
        lines.push(line);

    return `${lines.join('\n')}\n`;
}

/**
 * Saves what the edit window changed. A script you can write gets its header rewritten, and nothing else of it changes (its
 * mode and a symlink stay: Gio writes through them). One you cannot (owned by root) only changes group, in the groups file,
 * and only if its own header does not give one. Throws with the reason the window shows.
 */
export function saveCommand(command, {description, group, args}, says) {
    if (group.trim() === '')
        throw new Error(says('missingGroup'));

    if (!command.writable) {
        if (command.headerGroup !== '')
            throw new Error(says('readOnly'));
        const path = groupsFile();
        let text = '';
        try {
            text = new TextDecoder().decode(GLib.file_get_contents(path)[1]);
        } catch {}
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
        GLib.file_set_contents(path, setGroupLine(text, command.name, group));
        return path;
    }

    if (description.trim() === '')
        throw new Error(says('missingDescription'));
    checkArgs(args, says);

    const file = Gio.File.new_for_path(command.path);
    const [, bytes] = file.load_contents(null);
    let text;
    try {
        text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    } catch {
        throw new Error(says('notText'));
    }

    // A group that only came from the groups file, left as it was, keeps coming from there.
    const keepGroup = command.headerGroup === '' && group.trim() === command.group;
    const rewritten = rewriteHeader(text, {description, group: keepGroup ? null : group, args});
    file.replace_contents(new TextEncoder().encode(rewritten), null, false, Gio.FileCreateFlags.NONE, null);
    return command.path;
}

/** The description, the group and the parameters a script's first lines declare, or null if it is not one of ours. */
export function parseHeader(text) {
    const all = text.replaceAll('\0', '').split('\n');
    const lines = all.slice(0, HEADER_LINES);
    const value = prefix => {
        const line = lines.find(each => each.startsWith(prefix));
        return line === undefined ? '' : line.slice(prefix.length).trim();
    };
    const description = value('# help-commands:');

    if (description === '')
        return null;

    const args = all.slice(0, ARG_LINES)
        .filter(each => each.startsWith(ARG_PREFIX))
        .map(each => parseArg(each.slice(ARG_PREFIX.length)))
        .filter(each => each !== null);

    return {description, group: value('# help-commands-group:'), args};
}

/**
 * The arguments to run a command with, from what was typed for each parameter (same order): each one as a single argument,
 * spaces and all; an optional one left empty is not passed. `missing` names the required ones left empty: then it does not run.
 */
export function argvFor(args, values) {
    const argv = [];
    const missing = [];

    args.forEach((arg, i) => {
        const value = (values[i] ?? '').trim();

        if (value !== '')
            argv.push(value);
        else if (arg.required)
            missing.push(arg.name);
    });

    return {argv, missing};
}

/** "<command>=<group>" lines, "*=<group>" for the default; "#" starts a comment. */
export function parseGroups(text) {
    const groups = new Map();

    for (const raw of text.split('\n')) {
        const line = raw.trim();
        const at = line.indexOf('=');

        if (line === '' || line.startsWith('#') || at <= 0)
            continue;

        groups.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
    }

    return groups;
}

async function readGroups() {
    const file = Gio.File.new_for_path(groupsFile());

    try {
        const [contents] = await file.load_contents_async(null);
        return parseGroups(new TextDecoder().decode(contents));
    } catch {
        return new Map();
    }
}

async function readHeader(file) {
    const stream = await file.read_async(GLib.PRIORITY_DEFAULT, null);

    try {
        const bytes = await stream.read_bytes_async(HEADER_BYTES, GLib.PRIORITY_DEFAULT, null);
        return new TextDecoder('utf-8', {fatal: false}).decode(bytes.toArray());
    } finally {
        await stream.close_async(GLib.PRIORITY_DEFAULT, null);
    }
}

async function entriesOf(path) {
    const folder = Gio.File.new_for_path(path);
    const found = [];
    let enumerator;

    try {
        enumerator = await folder.enumerate_children_async(ATTRIBUTES, Gio.FileQueryInfoFlags.NONE, GLib.PRIORITY_DEFAULT, null);
    } catch {
        return found;
    }

    for (;;) {
        const infos = await enumerator.next_files_async(64, GLib.PRIORITY_DEFAULT, null);

        if (infos.length === 0)
            break;

        for (const info of infos) {
            if (info.get_file_type() !== Gio.FileType.REGULAR
                || !info.get_attribute_boolean('access::can-execute')
                || !info.get_attribute_boolean('access::can-read'))
                continue;

            found.push({
                name: info.get_name(),
                file: folder.get_child(info.get_name()),
                writable: info.get_attribute_boolean('access::can-write'),
            });
        }
    }

    return found;
}

/**
 * Every command, sorted by group and name: `{group, headerGroup, name, description, args, path, writable}`, where `headerGroup`
 * is the one its own header gives ('' if none).
 */
export async function scan() {
    const groups = await readGroups();
    const fallback = groups.get('*') || DEFAULT_GROUP;
    const seen = new Set(['help-commands']);
    const commands = [];

    for (const path of folders()) {
        for (const {name, file, writable} of await entriesOf(path)) {
            if (seen.has(name))
                continue;

            let header;
            try {
                header = parseHeader(await readHeader(file));
            } catch {
                continue;
            }

            if (header === null)
                continue;

            seen.add(name);
            commands.push({
                group: header.group || groups.get(name) || fallback,
                headerGroup: header.group,
                name,
                description: header.description,
                args: header.args,
                path: file.get_path(),
                writable,
            });
        }
    }

    return commands.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}
