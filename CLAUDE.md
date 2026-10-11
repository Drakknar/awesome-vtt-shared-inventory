# awesome-vtt-shared-inventory – project notes

Optional module, by Stefano Pignataro: the party's shared inventory (coins and items) for `../awesome-vtt` (table) and `../awesome-vtt-mobile` (phone). Foundry VTT v14, dnd5e 6.0.x (built against 6.0.5). Requires `../awesome-vtt-core`.

- **Own folder (user's decision, 2026-10-04):** the user asked for the shared inventory to live in its own module folder, not in the two modules. Its party logic, panel, template, CSS and language (`AVTTSI.`) are here (generic code is in core, see below); it draws its own panel (classes `avtsi-`), so it is an exception to "templates per module": the host passes `device` ("table" / "phone") and CSS adapts (`.avtsi-table`, `.avtsi-phone`; touch sizes on the phone, `--seat-color` on the table, `--avtsi-accent` set by the phone's CSS).
- **How hosts use it:** `game.modules.get("awesome-vtt-shared-inventory").api` (set at `init`), found through the core's `sharedInventory()` (null when the module is off). `api.mount(root, { actor, device })` returns a panel; the host calls `panel.render()` when it is shown (it only draws while visible: connected and not inside `[hidden]`). `api.canGive()` and `api.giveItem(actor, itemId)` back the hosts' `invToParty` inventory button. The hosts add the "party" section via the core's `sectionList()`.
- **No clashes with host handlers:** buttons use `data-avtsi-action`, fields are named `avtsi…`; the panel stops propagation of its clicks, changes and Enter keys. The table's number pad (`table/keypad.mjs`) works on its number fields (it dispatches input/change events).
- **Storage:** dnd5e's primary party (`game.actors.party`, a "group" actor with currency and items). GM can create one (default ownership Owner, set as `dnd5e.primaryParty`) or grant players Owner (`shareParty`). Players need Owner to change it; Observer sees it read-only.
- **Shared code stays in core (user's standing rule, restated 2026-10-04):** generic dnd5e logic lives in `../awesome-vtt-core`: moving coins and items between actors and stacking (`moveCurrency`, `copyItems`, `moveItem`, `addNamedItem`), quantities and currency (`changeQuantity`, `setCurrency`), carried item types (`INVENTORY_TYPES`), item descriptions, compendium search (`search(query, { types, filter })`), busy buttons (`runAction(..., action)`) and the `invToParty` sheet action and `toParty` sheet flag. This module only holds what is about the party (finding / creating / sharing it, its panel). Check core before adding logic here.
- **Re-drawing:** `watchChanges()` re-renders mounted panels on actor/item changes of the party or the panel's character, and on `dnd5e.primaryParty` changes.
- **Systems (2026-10-04, SotDL phase 2):** `party.mjs` `STORES` per system: dnd5e primary party (`game.actors.party`, group); SotDL the world setting `partyActor` (actor id, registered at init), the GM creates a "creature" named Party (Owner for all) or chooses any non-character actor (`chooseParty`, `choose` action). Coins via the core's `getCurrency`, moves via the adapter (`system.mjs`); the coin choice starts at gp or the first kind. `watchChanges` re-renders on the store's setting (`partySetting()`).
- **Actors sidebar menu (2026-10-10):** the GM can't reach the Party panel from the normal Foundry UI (only table / phone draw it), so `addActorContextOptions` (hook `getActorContextOptions`, registered at init) adds right-click entries: SotDL "use as party" (non-character actors, `chooseParty`) and "stop" (`STORES.demonlord.forget`); both systems "Let all players change it" (`shareParty`) on the party. dnd5e's own "Set as primary party" is not repeated. GM "Open the party's inventory" opens `PartyInventoryWindow` (panel.mjs, ApplicationV2, panel with `device: "window"`, no character, so no coin/item moves); GM rows get an `edit` action (item sheet). SotDL creature sheets hide inventory unless the system setting `demonlord.addCreatureInventoryTab` is on.
- **Status:** only syntax-checked so far (node --check, template precompile, JSON). Not yet run in a live world.
- **Checks after edits:** `node --check`, template precompile, JSON validation; keep the README in step.

## Upstream watch

`.github/workflows/compat-review.yml` runs daily and has Claude review this module once for each new version of a dependency, following `.github/prompts/foundry-compat.md`.
- **Game systems:** a release of a system in `relationships.systems` newer than its `verified` version.
- **Foundry core:** a new Stable build, with a light review within the verified generation and a full review for a new generation.
- **Results:**
  - The module is fine: a pull request that bumps `verified`. It goes out with the next manual release.
  - A fix: a pull request.
  - Anything that needs the owner: an issue labelled `upstream-watch` and assigned to the owner.
  - New features worth using: an `enhancement` issue.
- **Access:** Claude works with read-only access (secret `CLAUDE_CODE_OAUTH_TOKEN`). A separate job opens the pull request and issues.
- **Isolation (tested 2026-10-11):**
  - **Before Claude runs:** the review job turns on the action's subprocess secret scrub and installs bubblewrap, so Claude's commands don't see the Claude token or any other process. It also blocks reading other processes' memory and removes sudo, and Docker is switched off (Docker access amounts to root).
  - **After Claude:** the steps that follow ignore variables and PATH entries its commands could plant, and make the diff in a fresh clone.
  - **Publishing:** the report job won't publish output that contains the token, or a piece of it, and deletes the review's artifact.
  - **What's left:** Claude's commands never see the token, so leaking it would take a way around the sandbox. The scan is a second line of defence.
- **Bookkeeping:** `.github/scripts/watch.sh` records what was reviewed on the `watch-state` branch. Run the workflow by hand with `force` to review again.
