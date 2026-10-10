import { MODULE_ID } from "./constants.mjs";
import * as party from "./party.mjs";
import { refocus, runAction, exclusive } from "../../awesome-vtt-core/scripts/ui.mjs";

const { renderTemplate } = foundry.applications.handlebars;
const TEMPLATE = `modules/${MODULE_ID}/templates/panel.hbs`;
const SEARCH_DEBOUNCE_MS = 250;

/** Actions that change data; their button is disabled until done. */
const BUSY_ACTIONS = new Set([
  "create", "choose", "share", "deposit", "withdraw", "addName", "addUuid", "qty", "remove", "take", "details"
]);

/** Mounted panels, re-drawn when the party or their character changes. */
const panels = new Set();

/**
 * The shared inventory panel, drawn into an element the host module provides (a table seat's panel or the phone's
 * Party view). Its buttons use `data-avtsi-action` and its fields `avtsi…` names, so the host's own handlers leave
 * them alone. The host calls `render()` when the panel is shown.
 */
export class SharedInventoryPanel {
  /**
   * @param {HTMLElement} root
   * @param {object} options
   * @param {() => Actor|null} options.actor  The character shown with the panel.
   * @param {"table"|"phone"|"window"} options.device  The table and the window also offer dragging items in.
   */
  constructor(root, { actor, device }) {
    this.root = root;
    this.actor = actor;
    this.device = device;
    this.state = {
      coin: null, amount: "", name: "", quantity: 1, query: "", results: null, details: {}
    };
    this.render = foundry.utils.debounce(this.#renderNow.bind(this), 50);
    this.searchSoon = foundry.utils.debounce(() => this.#search(), SEARCH_DEBOUNCE_MS);
    root.classList.add("avtsi-panel", `avtsi-${device}`);
    root.addEventListener("click", this.#onClick.bind(this));
    root.addEventListener("input", this.#onInput.bind(this));
    root.addEventListener("change", this.#onChange.bind(this));
    root.addEventListener("keydown", this.#onKeyDown.bind(this));
    root.addEventListener("dragover", this.#onDragOver.bind(this));
    root.addEventListener("dragleave", () => root.classList.remove("avtsi-drop-target"));
    root.addEventListener("drop", this.#onDrop.bind(this));
    root.addEventListener("dragstart", this.#onDragStart.bind(this));
    panels.add(this);
  }

  /** Is the panel on screen (the host hides closed panels and other views)? */
  get visible() {
    return this.root.isConnected && !this.root.closest("[hidden]");
  }

  async #renderNow() {
    if ( !this.root.isConnected ) {
      panels.delete(this);
      return;
    }
    if ( !this.visible ) return;
    const focused = document.activeElement?.closest?.(".avtsi-panel") === this.root ? document.activeElement.name : null;
    const context = { ...party.partyContext(this.actor(), this.state), canDrag: this.device !== "phone" };
    this.root.innerHTML = await renderTemplate(TEMPLATE, context);
    // Typing in a text field survives a re-render.
    if ( ["avtsiQuery", "avtsiName"].includes(focused) ) refocus(this.root, focused);
  }

  /* -------------------------------------------- */
  /*  Events                                      */
  /* -------------------------------------------- */

  #onClick(event) {
    const target = event.target.closest("[data-avtsi-action]");
    if ( !target || !this.root.contains(target) ) return;
    event.preventDefault();
    event.stopPropagation();
    const action = target.dataset.avtsiAction;
    return runAction(target, BUSY_ACTIONS, () => this.#dispatch(action, target.dataset), `${MODULE_ID} | Action`, action);
  }

  async #dispatch(action, data) {
    const s = this.state;
    const actor = this.actor();
    switch ( action ) {
      case "create": return party.createParty();
      case "choose": return party.chooseParty(this.root.querySelector('[name="avtsiPartyChoice"]')?.value);
      case "share": return party.shareParty();
      case "coin":
        s.coin = data.coin;
        return this.render();
      case "deposit":
      case "withdraw": {
        const moved = await party.moveCurrency(actor, action, s.coin, s.amount);
        if ( moved ) s.amount = "";
        return this.render();
      }
      case "addName": return this.#addName();
      case "addUuid": return party.addFromUuid(data.uuid);
      case "clearSearch":
        Object.assign(s, { query: "", results: null });
        return this.render();
      case "qty": return party.changeQuantity(data.itemId, Number(data.delta));
      case "remove": return party.removeItem(data.itemId);
      case "edit": return party.editItem(data.itemId);
      case "take": return party.takeItem(actor, data.itemId);
      case "details":
        if ( data.itemId in s.details ) delete s.details[data.itemId];
        else s.details[data.itemId] = (await party.itemDescription(data.itemId))
          || `<p class="avtsi-muted">${foundry.utils.escapeHTML(game.i18n.localize("AVTTSI.NoDescription"))}</p>`;
        return this.render();
    }
  }

  #onInput(event) {
    const { name, value } = event.target;
    if ( name === "avtsiAmount" ) this.state.amount = value;
    if ( name === "avtsiName" ) this.state.name = value.slice(0, 80);
    if ( name === "avtsiQty" ) this.state.quantity = value;
    if ( name === "avtsiQuery" ) {
      this.state.query = value.slice(0, 64);
      this.searchSoon();
    }
  }

  #onChange(event) {
    const { name, value } = event.target;
    if ( !name?.startsWith("avtsi") ) return;
    // Keep the host (e.g. the table seat) from reading these fields as its own.
    event.stopPropagation();
    if ( name.startsWith("avtsiCurrency.") ) party.setPartyCurrency(name.slice("avtsiCurrency.".length), value);
  }

  #onKeyDown(event) {
    if ( event.key !== "Enter" ) return;
    const { name } = event.target;
    if ( name === "avtsiQuery" ) {
      event.preventDefault();
      this.#search();
    }
    else if ( ["avtsiName", "avtsiQty"].includes(name) ) {
      event.preventDefault();
      this.#addName();
    }
    if ( name?.startsWith("avtsi") ) event.stopPropagation();
  }

  /** Add the typed item. The Add button and Enter share one guard, so it isn't added twice. */
  #addName = exclusive(async () => {
    const s = this.state;
    if ( await party.addByName(s.name, s.quantity) ) Object.assign(s, { name: "", quantity: 1 });
    return this.render();
  });

  /** Search the compendiums (the core's search: null below its minimum length). */
  async #search() {
    const query = this.state.query;
    const results = await party.searchItems(query);
    // A newer search started meanwhile.
    if ( query !== this.state.query ) return;
    this.state.results = results;
    return this.render();
  }

  /* -------------------------------------------- */
  /*  Drag and drop                               */
  /* -------------------------------------------- */

  /** Search results can be dragged too (e.g. onto a character sheet). */
  #onDragStart(event) {
    const el = event.target.closest?.("[data-uuid][draggable]");
    if ( !el ) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "Item", uuid: el.dataset.uuid }));
  }

  #onDragOver(event) {
    if ( !party.canEdit(party.getParty()) ) return;
    event.preventDefault();
    this.root.classList.add("avtsi-drop-target");
  }

  async #onDrop(event) {
    this.root.classList.remove("avtsi-drop-target");
    if ( !party.canEdit(party.getParty()) ) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await party.addFromDrop(event);
    } catch(err) {
      console.error(`${MODULE_ID} | Drop failed`, err);
      ui.notifications.error(err.message);
    }
  }
}

/* -------------------------------------------- */

/**
 * The panel in a window of its own, for the normal Foundry UI (opened from the Actors sidebar's right-click menu on
 * the party). No character is shown, so coins and items aren't moved to or from one; the GM edits them directly.
 */
export class PartyInventoryWindow extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "avtsi-window",
    classes: ["avtsi-window"],
    window: { title: "AVTTSI.WindowTitle", icon: "fa-solid fa-sack", resizable: true },
    position: { width: 420, height: 600 }
  };

  /** @type {SharedInventoryPanel|null} */
  panel = null;

  /** Open the window, or bring it to the front. */
  static open() {
    const app = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id) ?? new this();
    return app.render({ force: true });
  }

  async _renderHTML() {
    return null;
  }

  _replaceHTML(result, content) {
    if ( !this.panel ) {
      const root = document.createElement("div");
      content.replaceChildren(root);
      this.panel = new SharedInventoryPanel(root, { actor: () => null, device: "window" });
    }
    // Debounced, so it draws once the window is on screen.
    this.panel.render();
  }

  _onClose(options) {
    super._onClose(options);
    this.panel = null;
  }
}

/* -------------------------------------------- */

/** Re-draw the visible panels when the party, or a panel's character, changes. */
export function watchChanges() {
  const refresh = doc => {
    const actor = (doc instanceof Actor) ? doc : (doc?.parent instanceof Actor ? doc.parent : null);
    const theParty = party.getParty();
    for ( const panel of panels ) {
      if ( !panel.root.isConnected ) {
        panels.delete(panel);
        continue;
      }
      if ( !actor || (actor === theParty) || (actor === panel.actor()) ) panel.render();
    }
  };
  for ( const hook of ["createActor", "updateActor", "deleteActor", "createItem", "updateItem", "deleteItem"] ) {
    Hooks.on(hook, refresh);
  }
  // The party changed (dnd5e's primary party, or the SotDL party actor setting).
  const changed = setting => (setting.key === party.partySetting()) && refresh(null);
  Hooks.on("updateSetting", changed);
  Hooks.on("createSetting", changed);
}
