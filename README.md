# Awesome VTT – Shared Inventory

The party's shared inventory for [Awesome VTT](../awesome-vtt) (table mode) and [Awesome VTT – Phone Companion](../awesome-vtt-mobile). When this module is active, both add a **Party** section: a panel in each table seat, and a tab on the phone.

- **Targets:** Foundry VTT v14 with dnd5e 6.0.x (built against 6.0.5) or Shadow of the Demon Lord (demonlord 6.1.x). Requires [`awesome-vtt-core`](../awesome-vtt-core).

## Where it is kept

**Shadow of the Demon Lord** has no party actor, so the GM creates one from the Party panel (a creature named "Party", owned by all players) or chooses an existing actor there; coins are gc / ss / cp / bits.

In dnd5e, coins and items are kept on dnd5e's **primary party**: a *group* actor marked as the primary party in the Actors sidebar (right-click → Set as primary party). If there is none, the GM can create one from the Party panel: it is named "Party", owned by all players, and made the primary party.

Players need **Owner** permission on the party to change it. With less, the panel is read-only (Observer) or says that the inventory isn't shared; the GM sees a **Let all players change it** button there.

**From the Actors sidebar (GM):** right-click an actor.
- Shadow of the Demon Lord: **Use as the party's shared inventory** on any non-character actor, and **Stop using as the party** on the current one.
- dnd5e: use dnd5e's own **Set as primary party** on a group actor.
- Both: **Open the party's inventory** on the party: the same panel in a window (add, search, drag items in, quantities, coins, remove), plus an **Edit** button per item that opens its sheet. **Let all players change it** on the party, while players aren't all Owners.
- SotDL's own creature sheet hides its Inventory tab unless the system setting **Add Inventory tab to the creature/vehicle sheets** is on.

## What the panel offers

- **Coins:** the party's amount of each coin, editable. **Put in** / **Take out** moves the chosen coin between the character shown and the party (at most what the giver has).
- **Items:** what the party carries (container contents nested), with quantity − / +, **Give to** the character shown (moves the whole stack), **Remove** (asks first), and the description (tap the name).
- **Add items:**
  - by typing a name and quantity (added as loot, or stacked onto a loot item of the same name);
  - by searching the Item compendiums (physical items only) and tapping a result;
  - on the table, by dragging an item onto the panel: from a compendium window, a character sheet, the seat's Compendium panel or the search results.
- **Give to the party** from a character's inventory (both modules): moves the whole stack. Items that aren't containers are stacked onto a party item with the same name and type.

## Structure

```
module.json
scripts/
  main.mjs        the API the table and phone modules use (mount, canGive, giveItem)
  party.mjs       the party actor (find, create, share) and its panel data; moving coins and items, stacking and
                  search are the core's
  panel.mjs       the panel drawn into a host element, its events, and re-drawing on changes
  constants.mjs
templates/panel.hbs, templates/item.hbs
styles/shared-inventory.css
lang/en.json      labels (prefix AVTTSI.)
```
