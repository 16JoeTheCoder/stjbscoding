# Curriculum format

The whole curriculum is one JSON file: `curriculum/curriculum.json`. Admins upload it on **Admin > Curriculum**. The app checks it with `validateCurriculum()` in `src/curriculum.js`; `curriculum/curriculum.schema.json` gives the same rules to editors like VS Code (autocomplete and red underlines), because the file starts with `"$schema": "./curriculum.schema.json"`. If the two ever disagree, the app's check wins.

## Shape

```jsonc
{
  "$schema": "./curriculum.schema.json",
  "formatVersion": 1,
  "tracks": [
    {
      "id": "python",                       // "python" or "scratch"
      "title": "Python",
      "levels": [
        {
          "id": "py-l1",                     // stable id, see below
          "title": "Level 1: First programs",
          "overview": "Optional short text.",
          "topics": [
            {
              "id": "py-print",
              "title": "Output with print",
              "overview": "Shown in the library and on the topic page.",
              "source": {                     // optional: where the material comes from
                "title": "The Python Tutorial, section 3",
                "url": "https://docs.python.org/3/tutorial/introduction.html",
                "licence": "PSF License 2.0"
              },
              "lessons": [
                { "id": "py-print-1", "title": "Hello, world", "overview": "...",
                  "slides": "https://docs.google.com/presentation/d/.../edit" }
              ],
              "snippets": [                   // python track only; each gets a Run button
                { "id": "py-print-hello", "title": "Hello", "code": "print(\"Hello\")" },
                { "id": "py-input-greet", "title": "Greeting", "code": "name = input()\nprint(name)",
                  "stdin": ["Budi"] }         // lines fed to input(), in order
              ],
              "projects": [                   // weekly project options for this topic
                { "id": "py-print-card", "title": "Name card", "brief": "...", "starter": "# starter code\n" }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Required: `formatVersion`, `tracks`; every track, level, topic, lesson, snippet and project needs `id` and `title`; levels need at least one topic; snippets need `code`. Everything else is optional. Unknown fields are rejected, so typos in field names are caught.

Limits: titles 120 characters, overviews 2 000, code and starters 5 000. Links must start with `https://`.

## Ids

- Lowercase letters, digits and dashes, 2 to 48 characters, starting with a letter or digit: `py-l1`, `py-loops-while`.
- Unique across the whole file (not just within a level).
- **Never rename or reuse an id once published.** Classes store level ids in their pins, the "we are on this topic" pointer stores a topic id, and weekly projects store topic and option ids. Renaming breaks those links.

## Slides

`slides` is a Google Slides link. In Google Drive, share each deck with **General access: St. Johannes Berchmans School** (domain-restricted), not "Anyone with the link". Students open it with their school account.

## Versions and the frozen-level rule

Each upload published with **New version** becomes version 1, 2, 3, ... and is kept forever.

- **A class pins a level the first time it opens it.** "Opens" means its teacher sets the "We are here" pointer on a topic in that level. The pin records the version that was latest at that moment, and it never changes (the rules refuse any change to an existing pin).
- **Levels a class has not opened follow the latest version.**
- **Frozen levels never change.** A level is frozen once any class has pinned it. A new version must contain every frozen level exactly as it is in the version it was pinned to (same ids, same order, same text, same code). The admin page rejects the upload otherwise and says which level and which class.
- **So a new version can:** add levels, add or change topics in levels nobody has reached yet, and change project ideas in those levels.
- **Rollback:** "Make latest" on an older version. It is refused if that version would change a frozen level. Classes keep their pins either way, so nobody's reached levels change.

## Errata

For typos and repaired links in a version that is already in use, choose **Errata to an existing version** and upload the corrected file. The app compares it with that version and accepts it only if the differences are in these text fields: `title`, `overview`, `slides`, `brief`, `source` (`title`, `url`, `licence`). Ids, order, the number of items, snippet `code` and `stdin`, and project `starter` must be identical. The version number does not change; the correction is listed in that version's errata count.

If you want the fix in the next version as well, put it in your working file too; otherwise the next upload will be rejected for changing a frozen level.

## Snippet check

On upload the admin page runs every snippet with the same Python runtime students use (5-second limit each, `stdin` lines as input) and lists the ones that raise an error. Publishing with errors asks for confirmation, because an example that is meant to show an error is legitimate.

## Workflow for the maintainer

1. Edit `curriculum/curriculum.json` in VS Code (the schema gives hints).
2. VS Code terminal: `npm test` (checks the sample file is valid and every snippet runs).
3. Commit and push.
4. Admin > Curriculum > New version > choose the file > read the checks and preview > Publish.
