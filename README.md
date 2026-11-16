# Command Shelf

Your own scripts, grouped, one click away in the GNOME top bar.

You write small scripts for the things you do often: connect a VPN, back up the photos, start a dev environment. A month
later you no longer remember their names. Command Shelf keeps them on a shelf: an icon next to the clock lists them **by
group, with what each one does**, and runs the one you pick in a terminal. The same list is also a terminal menu,
`help-commands`.

```
⌨  ▾
   ── Home ───────────────────────
   backup-photos
     Copies the photos to the NAS.
   ── Work ───────────────────────
   vpn-up
     Connects the work VPN.
   start-dev
     Starts the dev environment and waits until it answers.
```

Nothing to register and no list to keep: a script shows up as soon as it carries one line.

## How a script joins the shelf

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

## Install

### The top bar icon (GNOME Shell 45 to 50)

```bash
git clone https://github.com/leonardojaviermaza/command-shelf.git
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
help-commands          # a menu (whiptail) to pick one and run it, asking for its arguments
help-commands --list   # just the list, by group
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
