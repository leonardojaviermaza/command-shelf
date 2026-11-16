// SPDX-License-Identifier: GPL-2.0-or-later
// The rules of extension/commands.js, run with GJS (no GNOME Shell needed):
//
//   gjs -m test/commands.test.js
//
// It builds a fake home with a few scripts and checks what `scan()` finds, plus the two parsers on their own.

import GLib from 'gi://GLib';
import System from 'system';

let failures = 0;
const check = (what, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a === e) {
        print(`ok   ${what}`);
    } else {
        failures++;
        print(`FAIL ${what}\n     expected ${e}\n     actual   ${a}`);
    }
};

const home = GLib.dir_make_tmp('command-shelf-XXXXXX');
const bin = GLib.build_filenamev([home, '.local', 'bin']);
const config = GLib.build_filenamev([home, '.config']);
GLib.mkdir_with_parents(bin, 0o755);
GLib.mkdir_with_parents(GLib.build_filenamev([config, 'help-commands']), 0o755);

const write = (path, text, mode = 0o755) => {
    GLib.file_set_contents(path, text);
    GLib.chmod(path, mode);
};

write(`${bin}/backup-photos`, '#!/bin/sh\n# help-commands: Copies the photos to the NAS.\n# help-commands-group: Home\n');
write(`${bin}/vpn-up`, '#!/bin/sh\n# help-commands: Connects the work VPN.\n');
write(`${bin}/plain-script`, '#!/bin/sh\necho no header here\n');
write(`${bin}/not-executable`, '#!/bin/sh\n# help-commands: Should not show.\n', 0o644);
write(`${bin}/late-header`, '#!/bin/sh\n#\n#\n#\n#\n#\n# help-commands: Past the fifth line.\n');
write(`${bin}/help-commands`, '#!/bin/sh\n# help-commands: The CLI itself is not listed.\n');
GLib.file_set_contents(`${config}/help-commands/groups`, '# comment\n*=Personal\nvpn-up = Work\n');

GLib.setenv('HOME', home, true);
GLib.setenv('XDG_CONFIG_HOME', config, true);

const {scan, parseHeader, parseGroups, DEFAULT_GROUP} = await import('../extension/commands.js');

check('parseHeader reads the description and the group',
    parseHeader('#!/bin/sh\n# help-commands: Does a thing.\n# help-commands-group: Tools\n'),
    {description: 'Does a thing.', group: 'Tools'});
check('parseHeader without the line is not a command', parseHeader('#!/bin/sh\necho hi\n'), null);
check('parseHeader ignores NUL bytes of a binary', parseHeader('\0ELF\0\0\n# help-commands: Odd.\n'), {description: 'Odd.', group: ''});
check('parseGroups reads pairs, the default and skips comments',
    [...parseGroups('# c\n*=Personal\n a = B \nbroken\n=nothing\n')], [['*', 'Personal'], ['a', 'B']]);
check('the built-in default group', DEFAULT_GROUP, 'General');

const found = (await scan()).filter(each => each.path.startsWith(home)).map(({group, name, description}) => ({group, name, description}));
check('scan finds, groups and sorts', found, [
    {group: 'Home', name: 'backup-photos', description: 'Copies the photos to the NAS.'},
    {group: 'Work', name: 'vpn-up', description: 'Connects the work VPN.'},
]);

GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(home)}`);

print(failures === 0 ? '\nall green' : `\n${failures} failing`);
if (failures > 0)
    System.exit(1);
