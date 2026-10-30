import sys from "../../awesome-vtt-core/scripts/system.mjs";
import { search } from "../../awesome-vtt-core/scripts/compendium.mjs";
import { MODULE_ID } from "./constants.mjs";

/**
 * The party's shared inventory: coins and items kept on a party actor.
 * - dnd5e: its primary party, a "group" actor (`game.actors.party`).
 * - Shadow of the Demon Lord (no party actor in the system): an actor the GM creates or chooses (user's decision,
 *   2026-10-04), its id in this module's world setting `partyActor`. A new one is a "creature", so it isn't listed
 *   among the players' characters.
 * Players need Owner permission on it to change it; the GM can create it from the panel (owned by all players) or
 * give players that permission. Moving coins and items, stacking and quantities are the core's (the system
 * adapters); this file only adds what is about the party.
 */

const loc = key => game.i18n.localize(key);
const byName = (a, b) => a.name.localeCompare(b.name);
const { OWNER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;

/**
 * Where each system keeps the party: how to find it, the actor type a new one gets, how it is made the party, and
 * whether the GM may choose an existing actor instead.
 */
const STORES = {
  dnd5e: {
    get() {
      const party = game.actors.party ?? null;
      return (party?.type === "group") ? party : null;
    },
    type: "group",
    remember: party => game.settings.set("dnd5e", "primaryParty", { actor: party }),
    setting: "dnd5e.primaryParty",
    canChoose: false
  },
  demonlord: {
    get: () => game.actors.get(game.settings.get(MODULE_ID, "partyActor")) ?? null,
    type: "creature",
    remember: party => game.settings.set(MODULE_ID, "partyActor", party.id),
    forget: () => game.settings.set(MODULE_ID, "partyActor", ""),
    setting: `${MODULE_ID}.partyActor`,
    canChoose: true
  }
};

const store = () => STORES[game.system.id] ?? null;

/**
 * Does this module support the world's system?
 * @returns {boolean}
 */
export const supported = () => !!store();

/**
 * The setting that names the party (re-draw panels when it changes).
 * @returns {string|null}
 */
export const partySetting = () => store()?.setting ?? null;

/**
 * The party actor, or null.
 * @returns {Actor|null}
 */
export function getParty() {
  return store()?.get() ?? null;
}

/**
 * Can this user change the party's coins and items?
 * @param {Actor|null} party
 * @returns {boolean}
 */
export const canEdit = party => !!party?.isOwner;

/**
 * May this user see the party's contents (at least Observer)?
 * @param {Actor|null} party
 * @returns {boolean}
 */
const canSee = party => !!party?.testUserPermission(game.user, "OBSERVER");

/**
 * The party, if this user may change it.
 * @returns {Actor|null}
 */
function editableParty() {
  const party = getParty();
  return canEdit(party) ? party : null;
}

/* -------------------------------------------- */
/*  Data                                        */
/* -------------------------------------------- */

/**
 * Template data for the panel.
 * @param {Actor|null} actor  The character shown (coins and items move between it and the party).
 * @param {object} state      The panel's own state (chosen coin, amounts, search, open descriptions).
 * @returns {object}
 */
export function partyContext(actor, state) {
  const party = getParty();
  const context = { isGM: game.user.isGM, party: null, hidden: false, system: game.system.id };
  if ( !party ) {
    // SotDL: the GM can also make an existing actor (not a player character) the party.
    if ( game.user.isGM && store()?.canChoose ) {
      context.choices = game.actors.filter(a => a.type !== "character").sort(byName).map(a => ({ id: a.id, name: a.name }));
    }
    return context;
  }
  if ( !canSee(party) ) return Object.assign(context, { hidden: true });
  const own = actor?.isOwner ? actor : null;
  const items = party.items.filter(i => sys.INVENTORY_TYPES.includes(i.type));
  const coins = sys.getCurrency(party);
  const mine = own ? Object.fromEntries(sys.getCurrency(own).map(c => [c.key, c.value])) : {};
  // The coin chosen for moving: the first kind until one is picked (gp in dnd5e's list order, gc in SotDL).
  if ( !coins.some(c => c.key === state.coin) ) state.coin = coins.find(c => c.key === "gp")?.key ?? coins[0]?.key ?? null;
  const inContainer = item => !!item.system.container && !!party.items.get(item.system.container);
  const toEntry = item => ({
    id: item.id,
    name: item.name,
    img: item.img,
    quantity: item.system.quantity ?? 1,
    details: state.details[item.id] ?? null,
    contents: (item.type === "container") ? items.filter(i => i.system.container === item.id).sort(byName).map(toEntry) : []
  });
  return Object.assign(context, {
    ...state,
    party: { name: party.name, img: party.img },
    canEdit: canEdit(party),
    actor: own ? { name: own.name } : null,
    currency: coins.map(c => ({ ...c, mine: mine[c.key] ?? 0, selected: c.key === state.coin })),
    items: items.filter(i => !inContainer(i)).sort(byName).map(toEntry)
  });
}

/* -------------------------------------------- */
/*  Party (GM)                                  */
/* -------------------------------------------- */

/**
 * GM: create a party actor, owned by all players, and make it the party (dnd5e: its primary party).
 * @returns {Promise<Actor|null>} The new party, or null if this user can't create one.
 */
export async function createParty() {
  const s = store();
  if ( !game.user.isGM || !s ) return null;
  const party = await Actor.implementation.create({ name: loc("AVTTSI.DefaultName"), type: s.type, ownership: { default: OWNER } });
  if ( party ) await s.remember(party);
  return party;
}

/**
 * GM (SotDL): make an existing actor the party. Players need Owner on it; "Let all players change it" grants that.
 * @param {string} actorId
 * @returns {Promise<unknown>|null}
 */
export function chooseParty(actorId) {
  const actor = game.actors.get(actorId);
  if ( !game.user.isGM || !actor || !store()?.canChoose ) return null;
  return store().remember(actor);
}

/**
 * GM: let all players change the party's inventory (default permission Owner).
 * @returns {Promise<Actor>|undefined}
 */
export function shareParty() {
  const party = getParty();
  if ( game.user.isGM && party ) return party.update({ "ownership.default": OWNER });
}

/**
 * GM: entries in the Actors sidebar's right-click menu (hook `getActorContextOptions`). SotDL: use an actor as the
 * party, or stop. dnd5e has its own "Set as primary party" for group actors, so that isn't repeated. Both: open the
 * party's inventory in a window, and let all players change the party.
 * @param {ActorDirectory} app
 * @param {object[]} options
 * @param {() => void} openWindow  Opens the party inventory window (the panel's, kept out of this file).
 */
export function addActorContextOptions(app, options, openWindow) {
  const s = store();
  if ( !s ) return;
  const actorOf = li => game.actors.get(li.dataset.entryId);
  if ( s.canChoose ) options.push({
    label: "AVTTSI.MenuSet",
    icon: "fa-solid fa-sack",
    group: "system",
    visible: li => {
      const actor = actorOf(li);
      return game.user.isGM && !!actor && (actor.type !== "character") && (actor !== getParty());
    },
    onClick: (_, li) => chooseParty(li.dataset.entryId)
  }, {
    label: "AVTTSI.MenuUnset",
    icon: "fa-solid fa-xmark",
    group: "system",
    visible: li => game.user.isGM && !!actorOf(li) && (actorOf(li) === getParty()),
    onClick: () => s.forget()
  });
  options.push({
    label: "AVTTSI.MenuOpen",
    icon: "fa-solid fa-box-open",
    group: "system",
    visible: li => game.user.isGM && !!actorOf(li) && (actorOf(li) === getParty()),
    onClick: () => openWindow()
  }, {
    label: "AVTTSI.Share",
    icon: "fa-solid fa-users",
    group: "system",
    visible: li => {
      const actor = actorOf(li);
      return game.user.isGM && !!actor && (actor === getParty()) && (actor.ownership.default < OWNER);
    },
    onClick: () => shareParty()
  });
}

/* -------------------------------------------- */
/*  Coins and items                             */
/* -------------------------------------------- */

/**
 * Set how many coins of one kind the party has, if this user may change it.
 * @param {string} key
 * @param {number|string} value
 * @returns {Promise<Actor>|undefined}
 */
export function setPartyCurrency(key, value) {
  const party = editableParty();
  if ( party ) return sys.setCurrency(party, key, value);
}

/**
 * Deposit: character → party. Withdraw: party → character. Returns how many coins moved.
 * @param {Actor|null} actor
 * @param {"deposit"|"withdraw"} direction
 * @param {string} key
 * @param {number|string} amount
 * @returns {number|Promise<number>}
 */
export function moveCurrency(actor, direction, key, amount) {
  const party = editableParty();
  if ( !party || !actor ) return 0;
  const [from, to] = (direction === "withdraw") ? [party, actor] : [actor, party];
  return sys.moveCurrency(from, to, key, amount);
}

/**
 * Add an item typed by name to the party: more of a loose loot item with that name, or a new one.
 * @param {string} name
 * @param {number|string} quantity
 * @returns {Promise<Item|undefined>|null}
 */
export function addByName(name, quantity) {
  const party = editableParty();
  return party ? sys.addNamedItem(party, name, quantity) : null;
}

/**
 * Add an item from a compendium or the world (a uuid, e.g. dropped or found by search). Carried items only.
 * @param {string} uuid
 * @returns {Promise<void>}
 */
export async function addFromUuid(uuid) {
  const party = editableParty();
  if ( !party || (typeof uuid !== "string") ) return;
  const item = await fromUuid(uuid).catch(() => null);
  if ( !(item instanceof Item) || !sys.INVENTORY_TYPES.includes(item.type) ) {
    ui.notifications.warn("AVTTSI.NotAnItem", { localize: true });
    return;
  }
  if ( item.parent !== party ) return sys.copyItems([item], party);
}

/**
 * Add whatever Item was dropped on the panel (from a compendium window, a sheet, or a search result).
 * @param {DragEvent} event
 * @returns {Promise<void>|undefined}
 */
export function addFromDrop(event) {
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if ( (data?.type === "Item") && data.uuid ) return addFromUuid(data.uuid);
}

/**
 * Change the quantity of one of the party's items by one, if this user may change the party.
 * @param {string} itemId
 * @param {number} delta
 * @returns {Promise<Item>|undefined}
 */
export function changeQuantity(itemId, delta) {
  const party = editableParty();
  if ( party ) return sys.changeQuantity(party, itemId, delta);
}

/**
 * Remove one of the party's items (and a container's contents), after asking.
 * @param {string} itemId
 * @returns {Promise<Item|undefined>}
 */
export async function removeItem(itemId) {
  const item = editableParty()?.items.get(itemId);
  if ( !item ) return;
  const ok = await foundry.applications.api.DialogV2.confirm({
    window: { title: "AVTTSI.Remove" },
    content: `<p>${foundry.utils.escapeHTML(game.i18n.format("AVTTSI.RemoveConfirm", { name: item.name }))}</p>`
  });
  if ( ok ) return item.delete({ deleteContents: true });
}

/**
 * GM: open one of the party's items in its sheet, to change anything about it.
 * @param {string} itemId
 * @returns {Promise<ApplicationV2>|undefined}
 */
export function editItem(itemId) {
  const item = game.user.isGM ? getParty()?.items.get(itemId) : null;
  return item?.sheet.render({ force: true });
}

/**
 * A character gives one of its items (the whole stack) to the party.
 * @param {Actor} actor
 * @param {string} itemId
 * @returns {Promise<Item|undefined>}
 */
export const giveItem = (actor, itemId) => sys.moveItem(actor, editableParty(), itemId);

/**
 * A character takes one of the party's items (the whole stack).
 * @param {Actor} actor
 * @param {string} itemId
 * @returns {Promise<Item|undefined>}
 */
export const takeItem = (actor, itemId) => sys.moveItem(editableParty(), actor, itemId);

/**
 * An item's description, as a player may see it.
 * @param {string} itemId
 * @returns {Promise<string>|string}
 */
export function itemDescription(itemId) {
  const party = getParty();
  return party ? sys.getItemDescription(party, itemId) : "";
}

/**
 * Carried items in visible Item compendiums whose name contains the query (the core's search).
 * @param {string} query
 * @returns {Promise<object[]|null>} Index entries ({uuid, name, img, pack}); null below the minimum length.
 */
export const searchItems = query =>
  search(query, { types: ["Item"], filter: e => !e.type || sys.INVENTORY_TYPES.includes(e.type) });
