# Tin

Tin is a player and file format for small, self-contained apps. A `.tin` file
is a SQLite database that bundles an app's HTML with its data and assets. Open
the file in a Tin player to run the app in a sandbox.

## Run the player

Use Node.js 22.18 or later to run the TypeScript CLI directly.

```sh
npm install
npm run dev --workspace @tin/web
```

Open the local URL printed by Vite, choose a `.tin` file, and use **Download
.tin** to save its current state.

To run the desktop player instead:

```sh
npm run tauri --workspace @tin/desktop -- dev
```

The desktop player can open and save `.tin` files. Apps can make network
requests there through `tin.http`; the player asks permission before a host is
accessed. Network access is not available in the web player.

## Create and inspect files

The CLI can package an HTML file, extract an app's latest HTML, inspect file
metadata, and print documents from a collection:

```sh
node packages/cli/src/index.ts pack examples/todo.html -o todo.tin
node packages/cli/src/index.ts inspect todo.tin
node packages/cli/src/index.ts dump todo.tin --collection todos
node packages/cli/src/index.ts unpack todo.tin -o unpacked
```

The repository includes sample apps in [`examples/`](examples/). For example,
to package a different one, replace `examples/todo.html` with
`examples/habit-tracker.html` or `examples/recipes.html`.

## App API

The player injects `window.tin` into the app. Collections provide asynchronous
document operations; documents are stored as JSON in the `.tin` file.

```html
<script>
  const todos = tin.collection("todos");

  async function addTodo(title) {
    await todos.insert({ title, done: false });
  }

  async function showTodos() {
    return todos.find({}, { sort: { _created_at: 1 } });
  }
</script>
```

The SDK also provides `findOne`, `update`, `delete`, and `count` on
collections; app metadata via `tin.meta`; asset management via `tin.assets`;
and a `localStorage`-compatible persistent key/value store. See the [examples](examples/)
for complete apps and [`packages/sdk/src/index.ts`](packages/sdk/src/index.ts)
for the injected API implementation.

## File format

A `.tin` file is a regular SQLite database with an application ID and schema
version. It stores UI versions, app metadata, JSON documents, key/value data,
assets, and permission records. See [`SPEC.md`](SPEC.md) for the schema and
versioning rules. You can open a file with standard SQLite tools.

## Development

Build either player frontend with:

```sh
npm run build --workspace @tin/web
npm run build --workspace @tin/desktop
```

Run the format and runtime tests with:

```sh
npm test --workspace @tin/format
npm test --workspace @tin/runtime
```
