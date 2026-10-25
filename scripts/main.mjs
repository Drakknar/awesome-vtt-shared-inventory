import { MODULE_ID } from "./constants.mjs";
import { SharedInventoryPanel, PartyInventoryWindow, watchChanges } from "./panel.mjs";
import { getParty, canEdit, giveItem, supported, addActorContextOptions } from "./party.mjs";
import { fixStatusIds } from "../../awesome-vtt-core/scripts/system.mjs";

/**
 * The party's shared inventory, for Awesome VTT (table seats) and its Phone Companion. This module draws nothing on
 * its own: when it is active, those modules add a "Party" section and mount its panel there through this API.
 */
Hooks.once("init", () => {
  // Static _ids for SotDL's Blinded / Unconscious, also when the table and phone modules are off (core's fixStatusIds).
  fixStatusIds();
  // The item row is a named partial ({{> avtsiItem}}), used for container contents too.
  foundry.applications.handlebars.loadTemplates({
    avtsiItem: `modules/${MODULE_ID}/templates/item.hbs`,
    avtsiPanel: `modules/${MODULE_ID}/templates/panel.hbs`
  });
  // dnd5e: its primary party holds the inventory. SotDL: an actor the GM creates or chooses (its id here).
  if ( !supported() ) return;
  game.settings.register(MODULE_ID, "partyActor", {
    scope: "world", config: false, type: new foundry.data.fields.StringField({ blank: true, initial: "" })
  });
  // GM: right-click an actor in the Actors sidebar to make it the party, open its inventory, or share it.
  Hooks.on("getActorContextOptions", (app, options) => addActorContextOptions(app, options, () => PartyInventoryWindow.open()));
  game.modules.get(MODULE_ID).api = {
    /**
     * Draw the panel into an element of the host module.
     * @param {HTMLElement} root
     * @param {{actor: () => Actor|null, device: "table"|"phone"}} options
     * @returns {SharedInventoryPanel}  Call its render() when the panel is shown.
     */
    mount: (root, options) => new SharedInventoryPanel(root, options),
    /** Can this user put things into the party's inventory (a party exists and they own it)? */
    canGive: () => canEdit(getParty()),
    /** Move one of the character's items (the whole stack) to the party. */
    giveItem
  };
});

Hooks.once("ready", () => {
  if ( !supported() ) return;
  watchChanges();
});
