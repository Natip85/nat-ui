# @nat-ui/cli

Add [nat-ui](https://nat-ui-delta.vercel.app) components to your project as source you own and
can edit, not installed as a dependency you can only configure.

Components are React, built on [Base UI](https://base-ui.com) for behavior and Tailwind CSS v4
for styling. The CLI itself needs Node 22.13+, since it runs through `npx`.

## Usage

```bash
npx @nat-ui/cli@latest init
npx @nat-ui/cli@latest add button
```

`init` configures the project once: it finds your stylesheet, writes `components.json` from your
detected aliases, creates the `cn` helper, adds the theme variables, and installs `clsx` and
`tailwind-merge`.

`add` reads that config, so components land where you already keep things with their imports
rewritten to your aliases. Dependencies come with them.

To take everything the registry has rather than naming components one at a time:

```bash
npx @nat-ui/cli@latest add --all
```

## Options

| Option             | Effect                                             |
| ------------------ | -------------------------------------------------- |
| `-y`, `--yes`      | Accept every default without asking                |
| `--overwrite`      | Replace files that already exist                   |
| `--all`            | Add every item in the registry, libraries included |
| `--registry <url>` | Use a different registry                           |
| `-v`, `--version`  | Print the version                                  |
| `-h`, `--help`     | Show this message                                  |

`--yes` and `--overwrite` are not two ways of saying the same thing. `--yes` accepts defaults, and
keeping the file you already have is the default, so `--yes` answers _no_ to the overwrite
question. `--overwrite` is what answers yes.

## Already using shadcn?

You don't need this CLI. Every component is published in shadcn's registry format as well as
nat-ui's:

```bash
npx shadcn@latest add https://nat-ui-delta.vercel.app/s/button.json
```

This CLI is still the better option for a new project, where `init` writing theme tokens and
`components.json` is a service rather than an intrusion.

## Documentation

Full documentation is at [nat-ui-delta.vercel.app/docs](https://nat-ui-delta.vercel.app/docs).

## License

MIT
