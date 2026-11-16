// Finds the commands: the executables of the folders below whose first lines carry the help-commands header.
//
//   # help-commands: <what it does>
//   # help-commands-group: <group>        (optional)
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

const HEADER_BYTES = 1024;
const HEADER_LINES = 5;
const ATTRIBUTES = 'standard::name,standard::type,access::can-execute,access::can-read';

/** The folders scanned, in order: the first one that has a name wins. */
export function folders() {
    return [GLib.build_filenamev([GLib.get_home_dir(), '.local', 'bin']), '/usr/local/bin'];
}

/** The description and the group a script's first lines declare, or null if it is not one of ours. */
export function parseHeader(text) {
    const lines = text.replaceAll('\0', '').split('\n').slice(0, HEADER_LINES);
    const value = prefix => {
        const line = lines.find(each => each.startsWith(prefix));
        return line === undefined ? '' : line.slice(prefix.length).trim();
    };
    const description = value('# help-commands:');

    return description === '' ? null : {description, group: value('# help-commands-group:')};
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
    const file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_config_dir(), 'help-commands', 'groups']));

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

            found.push({name: info.get_name(), file: folder.get_child(info.get_name())});
        }
    }

    return found;
}

/** Every command, sorted by group and name: `{group, name, description, path}`. */
export async function scan() {
    const groups = await readGroups();
    const fallback = groups.get('*') || DEFAULT_GROUP;
    const seen = new Set(['help-commands']);
    const commands = [];

    for (const path of folders()) {
        for (const {name, file} of await entriesOf(path)) {
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
                name,
                description: header.description,
                path: file.get_path(),
            });
        }
    }

    return commands.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
}
