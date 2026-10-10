# Tin

Documents that run as apps. One file = UI + data + files.

A `.tin` file is a SQLite database containing an app's HTML, its data, and its files. A player opens the file, runs the HTML in a sandbox, and gives it access to the database through a small JS bridge.

Build plan lives locally in `PLAN.md` (not tracked in this repo).
