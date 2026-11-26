# Command Shelf

Your own scripts, grouped, one click away in the GNOME top bar.

You write small scripts for the things you do often: connect a VPN, back up the photos, start a dev environment. A month
later you no longer remember their names. Command Shelf keeps them on a shelf: an icon next to the clock lists them **by
group, with what each one does**, and runs the one you pick in a terminal. The same list is also a terminal menu,
`help-commands`.

```
⌨  ▾
   Home                         ▸
   Work                         ▾
      vpn-up                    ✎
        Connects the work VPN.
      start-dev                 ✎
        Starts the dev environment and waits until it answers.
   ───────────────────────────────
   ＋ Add command…
```

Nothing to register and no list to keep: a script shows up as soon as it carries one line.

## Adding a command

From the menu, **Add command…** asks for four things and writes the script in `~/.local/bin`:

| Field | Example |
| --- | --- |
| Name | `vpn-up` |
| Group | `Work`: pick one of the existing groups, or type a new name and it says it will create it |
| What it does | `Connects the work VPN.` |
| What it runs | `nmcli connection up "Work"` |

The **✎** next to a command opens its script in your text editor, to change what it runs, its description or its group.
For a command you cannot edit (owned by root), it opens the groups file instead (below).

In a terminal, `help-commands --add` asks the same four questions, and asks before creating a new group.

## Groups folded or open

Each group folds and unfolds with a click. In the extension's settings (the gear in **Extensions**), **Folded groups**
decides how they start: folded, so a long list starts short, or all open. With folded groups, the ones you open stay open
the next time, until you fold them.

## How a script joins the shelf by hand

Put the script in `~/.local/bin` or `/usr/local/bin`, make it executable, and add this line among its first five:

```bash
#!/usr/bin/env bash
# help-commands: Connects the work VPN.
# help-commands-group: Work
```

- `# help-commands:` is what it does, as the menu shows it. Without it, the script is not listed.
- `# help-commands-group:` is optional: the group it goes under.

For scripts you cannot edit (someone else's, or owned by root), give their group in `~/.config/help-commands/groups`:

```
# <command>=<group>, one per line; "*" is the group of everything else.
*=Personal
vpn-up=Work
start-dev=Work
```

Without a group anywhere, a script goes to **General**. If a name is in both folders, `~/.local/bin` wins.

## Commands that need parameters

A script that needs arguments says which ones, one line each and in the order it takes them, among its first 30 lines:

```bash
#!/usr/bin/env bash
# help-commands: Opens the database writes for a while.
# help-commands-group: Work
# help-commands-arg: <environment=prod|staging> Where to open them
# help-commands-arg: [minutes=30] How long they stay open
# help-commands-arg: <reason> Why you open them
```

- `<name>` is required, `[name]` optional; what follows is the help shown next to its field.
- `name=value` starts the field with that value; `name=a|b` proposes both, as buttons, starting with the first. They are
  suggestions: you can type any other value, and checking it is the script's job.

Picking such a command in the menu opens a window with one field per parameter before running it. A required one left
empty keeps it from running (the window says what is missing; Esc cancels). An optional one left empty is not passed at
all. Each answer reaches the script as one argument, spaces included, so `"<reason>"` needs no quotes.

`help-commands` asks for the same parameters, one by one, in the terminal (a required one is asked again while empty;
Ctrl-D leaves). A command that declares none runs without arguments from the menu, and the terminal asks for a free line
of arguments, as before.

## Install

### The top bar icon (GNOME Shell 45 to 50)

```bash
git clone https://github.com/leonardojaviermaza/command-shelf.git
glib-compile-schemas command-shelf/extension/schemas
mkdir -p ~/.local/share/gnome-shell/extensions
ln -s "$PWD/command-shelf/extension" ~/.local/share/gnome-shell/extensions/command-shelf@leonardojaviermaza.github.io
```

Log out and back in (on Wayland, GNOME only discovers new extensions at login), then:

```bash
gnome-extensions enable command-shelf@leonardojaviermaza.github.io
```

The list is read again every time you open the menu: a new script shows up without restarting anything. A command opens in
your terminal (`xdg-terminal-exec`, Ptyxis, GNOME Terminal, Console, Konsole or `x-terminal-emulator`, the first one
found) and waits for a key at the end, so its output stays on screen.

### The terminal menu

```bash
sudo install -m 755 command-shelf/bin/help-commands /usr/local/bin/
```

```bash
help-commands          # a menu (whiptail) to pick one and run it, asking for its parameters
help-commands --list   # just the list, by group
help-commands --add    # add a new command
```

It speaks Spanish when your system does.

## Development

The rules that find and group the commands live in `extension/commands.js`, with no GNOME Shell code, so they run with GJS:

```bash
gjs -m test/commands.test.js
```

To see the extension's errors while trying it, `journalctl -f -o cat /usr/bin/gnome-shell`.

## License

GPL-2.0-or-later, like GNOME Shell. See [LICENSE](LICENSE).
