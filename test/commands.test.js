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
write(`${bin}/open-writes`, [
    '#!/bin/sh',
    '# help-commands: Opens the writes.',
    '#',
    '# Usage: open-writes <environment> [minutes] "<reason>"',
    '#',
    '# help-commands-arg: <environment=prod|staging> Where',
    '# help-commands-arg: [minutes=30] How long',
    '# help-commands-arg: <reason> Why',
    '',
].join('\n'));
write(`${bin}/help-commands`, '#!/bin/sh\n# help-commands: The CLI itself is not listed.\n');
GLib.file_set_contents(`${config}/help-commands/groups`, '# comment\n*=Personal\nvpn-up = Work\n');

GLib.setenv('HOME', home, true);
GLib.setenv('XDG_CONFIG_HOME', config, true);

const {scan, parseHeader, parseArg, argvFor, parseGroups, DEFAULT_GROUP, validName, groupNames, isKnownGroup, scriptFor, createCommand} =
    await import('../extension/commands.js');
const says = (key, ...args) => [key, ...args].join(':');

check('parseHeader reads the description and the group',
    parseHeader('#!/bin/sh\n# help-commands: Does a thing.\n# help-commands-group: Tools\n'),
    {description: 'Does a thing.', group: 'Tools', args: []});
check('parseHeader without the line is not a command', parseHeader('#!/bin/sh\necho hi\n'), null);
check('parseHeader ignores NUL bytes of a binary', parseHeader('\0ELF\0\0\n# help-commands: Odd.\n'), {description: 'Odd.', group: '', args: []});
check('parseArg: <name> is required, [name] optional, the rest is the help', [
    parseArg(' <environment> Where it opens'),
    parseArg('[minutes]'),
], [
    {name: 'environment', required: true, value: '', choices: [], help: 'Where it opens'},
    {name: 'minutes', required: false, value: '', choices: [], help: ''},
]);
check('parseArg: =value starts the field with it, a|b proposes both and starts with the first', [
    parseArg('[minutes=30] How long'),
    parseArg('<confirm= yes | no |> Copy first'),
], [
    {name: 'minutes', required: false, value: '30', choices: ['30'], help: 'How long'},
    {name: 'confirm', required: true, value: 'yes', choices: ['yes', 'no'], help: 'Copy first'},
]);
check('parseArg: a line that is neither is no parameter', ['environment', '<>', '[ ]', '<=x>', ''].map(parseArg), [null, null, null, null, null]);
check('parseHeader reads the parameters in order, also past the fifth line',
    parseHeader('#!/bin/sh\n# help-commands: X.\n#\n#\n#\n#\n# help-commands-arg: <a>\n# help-commands-arg: bad\n# help-commands-arg: [b=1]\n')
        .args.map(({name, required, value}) => [name, required, value]),
    [['a', true, ''], ['b', false, '1']]);
check('parseHeader: past the 30th line a parameter is not read',
    parseHeader(`#!/bin/sh\n# help-commands: X.\n${'#\n'.repeat(28)}# help-commands-arg: <late>\n`).args, []);
const zoorden = [{name: 'environment', required: true}, {name: 'minutes', required: false}, {name: 'reason', required: true}];
check('argvFor: one argument per answer, spaces and all, trimmed',
    argvFor(zoorden, ['prod', ' 45 ', 'fix the base']), {argv: ['prod', '45', 'fix the base'], missing: []});
check('argvFor: an optional one left empty is not passed', argvFor(zoorden, ['prod', '', 'fix']), {argv: ['prod', 'fix'], missing: []});
check('argvFor: the required ones left empty are missing', argvFor(zoorden, [' ', '30', '']).missing, ['environment', 'reason']);
check('parseGroups reads pairs, the default and skips comments',
    [...parseGroups('# c\n*=Personal\n a = B \nbroken\n=nothing\n')], [['*', 'Personal'], ['a', 'B']]);
check('the built-in default group', DEFAULT_GROUP, 'General');

const found = (await scan()).filter(each => each.path.startsWith(home)).map(({group, name, description}) => ({group, name, description}));
check('scan finds, groups and sorts', found, [
    {group: 'Home', name: 'backup-photos', description: 'Copies the photos to the NAS.'},
    {group: 'Personal', name: 'open-writes', description: 'Opens the writes.'},
    {group: 'Work', name: 'vpn-up', description: 'Connects the work VPN.'},
]);
check('scan carries the parameters each command declares',
    (await scan()).filter(each => each.path.startsWith(home)).map(each => [each.name, each.args.map(arg => arg.name)]),
    [['backup-photos', []], ['open-writes', ['environment', 'minutes', 'reason']], ['vpn-up', []]]);
check('scan says whether you can edit each one', (await scan()).filter(each => each.path.startsWith(home)).map(each => each.writable), [true, true, true]);

check('a valid name: letters, digits, dots, dashes, underscores',
    ['vpn-up', 'a', 'x.2_b', 'vpn up', '-x', '', 'a/b', '.hidden'].map(validName), [true, true, true, false, false, false, false, false]);
check('groupNames: the groups in use, once and sorted',
    groupNames([{group: 'Work'}, {group: 'Home'}, {group: 'Work'}]), ['Home', 'Work']);
check('isKnownGroup ignores case and borders', [isKnownGroup(' work ', ['Work']), isKnownGroup('Casa', ['Work'])], [true, false]);
check('scriptFor writes the header and the command, each field on one line',
    scriptFor({description: 'Connects\nthe VPN.', group: 'Work', command: '  nmcli connection up "Work"  '}),
    '#!/usr/bin/env bash\n# help-commands: Connects the VPN.\n# help-commands-group: Work\n\nnmcli connection up "Work"\n');

const created = createCommand({name: 'photos-sync', group: 'Casa', description: 'Syncs the photos.', command: 'echo synced'}, says);
check('createCommand writes it in ~/.local/bin', created, `${bin}/photos-sync`);
check('the new one is executable and the list finds it in its new group',
    (await scan()).filter(each => each.name === 'photos-sync').map(({group, description}) => ({group, description})),
    [{group: 'Casa', description: 'Syncs the photos.'}]);

const refusal = fields => {
    try {
        createCommand({name: 'ok', group: 'G', description: 'D', command: 'true', ...fields}, says);
        return 'created';
    } catch (error) {
        return error.message;
    }
};
check('createCommand refuses a bad name, a taken one and an empty field', [
    refusal({name: 'bad name'}),
    refusal({name: 'vpn-up'}),
    refusal({name: 'another', description: '  '}),
], ['invalidName', 'nameTaken:vpn-up', 'missingField']);

GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(home)}`);

print(failures === 0 ? '\nall green' : `\n${failures} failing`);
if (failures > 0)
    System.exit(1);
