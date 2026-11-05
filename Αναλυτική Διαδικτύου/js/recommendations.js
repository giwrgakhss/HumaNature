"use strict";

(() => {
  const PREFERENCES_KEY = "humanaturePreferences";
  const FAVORITES_KEY = "humanatureSavedTrips";
  const QUESTIONNAIRE_VERSION = 5;
  const SAVED_CATEGORY = "Saved ♥";
  const ANYWHERE = "Anywhere in Greece";

  // All six criteria add up to 100. Experience and terrain are hard constraints.
  const WEIGHTS = Object.freeze({
    activities: 30,
    environments: 20,
    discoveries: 15,
    mood: 15,
    region: 10,
    duration: 10
  });

  const EXPERIENCE_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 };
  const TERRAIN = {
    "Flat terrain / no uphill": "flat",
    "Gentle slopes": "gentle",
    "Moderate uphill": "moderate",
    "Steep climbs": "steep"
  };
  const COLORS = ["color-dibber", "color-pink", "color-blue", "color-green"];

  // Recognized words in the optional answer can influence the score by up to 5%.
  const TEXT_RULES = [
    { pattern: /bird|πουλ/iu, field: "discoveries", value: "Birds" },
    { pattern: /mushroom|μανιταρ/iu, field: "discoveries", value: "Mushrooms" },
    { pattern: /waterfall|καταρρακ/iu, field: "discoveries", value: "Waterfalls" },
    { pattern: /wildflower|αγριολουλουδ/iu, field: "discoveries", value: "Wildflowers" },
    { pattern: /butterfl|πεταλουδ|insects|εντομ/iu, field: "discoveries", value: "Butterflies & insects" },
    { pattern: /ancient tree|old tree|αιωνοβι/iu, field: "discoveries", value: "Ancient trees" },
    { pattern: /cave|σπηλαι/iu, field: "discoveries", value: "Caves" },
    { pattern: /spring|πηγ[εέή]/iu, field: "discoveries", value: "Natural springs" },
    { pattern: /turtle|χελων/iu, field: "discoveries", value: "Sea turtles" },
    { pattern: /dolphin|δελφιν/iu, field: "discoveries", value: "Dolphins" },
    { pattern: /stargaz|starry|αστερ/iu, field: "discoveries", value: "Starry skies" },
    { pattern: /forest|δασ/iu, field: "environments", value: "Forests" },
    { pattern: /sea|beach|θαλασσ|παραλι/iu, field: "environments", value: "Beaches & sea" },
    { pattern: /lake|river|λιμν|ποταμ/iu, field: "environments", value: "Lakes & rivers" },
    { pattern: /mountain|βουν/iu, field: "environments", value: "Mountains" },
    { pattern: /hiking|hike|πεζοπορ/iu, field: "activities", value: "Hiking" },
    { pattern: /climbing|αναρριχ/iu, field: "activities", value: "Climbing" },
    { pattern: /cycling|ποδηλα/iu, field: "activities", value: "Cycling" },
    { pattern: /camping|καμπινγκ/iu, field: "activities", value: "Camping" }
  ];

  const ui = {
    app: document.getElementById("recommendations-app"),
    error: document.getElementById("page-error"),
    profile: document.getElementById("profile-summary"),
    categories: document.getElementById("category-filters"),
    count: document.getElementById("results-count"),
    message: document.getElementById("results-message"),
    featured: document.getElementById("featured-trip"),
    grid: document.getElementById("trips-grid"),
    alternatives: document.getElementById("alternatives-heading"),
    empty: document.getElementById("empty-results"),
    emptyTitle: document.getElementById("empty-title"),
    emptyDescription: document.getElementById("empty-description"),
    clear: document.getElementById("clear-filters"),
    edit: document.getElementById("edit-preferences"),
    dialog: document.getElementById("trip-dialog"),
    dialogClose: document.getElementById("dialog-close"),
    dialogArt: document.getElementById("dialog-art"),
    dialogMatch: document.getElementById("dialog-match"),
    dialogSave: document.getElementById("dialog-save"),
    dialogTags: document.getElementById("dialog-matches"),
    dialogTitle: document.getElementById("dialog-title"),
    dialogLocation: document.getElementById("dialog-location"),
    dialogSummary: document.getElementById("dialog-summary"),
    dialogStats: document.getElementById("dialog-stats"),
    dialogHighlights: document.getElementById("dialog-highlights"),
    dialogSafety: document.getElementById("dialog-safety")
  };

  function readJSON(storage, key, fallback) {
    try {
      return JSON.parse(storage.getItem(key) || "null") ?? fallback;
    } catch (error) {
      console.warn(`Unable to read ${key}.`, error);
      return fallback;
    }
  }

  const preferences = readJSON(sessionStorage, PREFERENCES_KEY, null);
  const savedIds = readJSON(localStorage, FAVORITES_KEY, []);
  const favorites = new Set(Array.isArray(savedIds) ? savedIds.filter(id => typeof id === "string") : []);
  const trips = Array.isArray(window.HUMANATURE_TRIPS) ? window.HUMANATURE_TRIPS : [];
  const knownTextRules = TEXT_RULES.filter(rule => rule.pattern.test(preferences?.freeText || ""));

  let rankedTrips = [];
  let selectedCategory = "All";
  let currentDetail = null;
  let colorByTripId = new Map();

  const selections = key => Array.isArray(preferences?.[key]) ? preferences[key] : [];
  const first = key => selections(key)[0] || "";

  function makeElement(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = text;
    return node;
  }

  function makeButton(text, className, onClick) {
    const node = makeElement("button", className, text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  }

  function commonValues(preferred, offered) {
    if (!Array.isArray(offered)) return [];
    return preferred.filter(value => offered.includes(value));
  }

  // Selecting several options means flexibility, not a requirement to match every option.
  function matchRatio(preferred, offered) {
    if (!preferred.length || !Array.isArray(offered) || !offered.length) return 0;
    return commonValues(preferred, offered).length / Math.min(preferred.length, offered.length);
  }

  function isSuitable(trip) {
    if (EXPERIENCE_RANK[trip.level] > EXPERIENCE_RANK[first("experience")]) return false;
    if (!selections("uphill").map(choice => TERRAIN[choice]).includes(trip.uphill)) return false;

    const text = preferences.freeText || "";
    if (/no uphill|without uphill|χωρ[ιί]ς ανηφορ/iu.test(text)) return trip.uphill === "flat";
    if (/no steep|without steep|avoid steep/iu.test(text)) return trip.uphill !== "steep";
    return true;
  }

  function scoreTrip(trip) {
    let score = 0;
    const reasons = [];

    for (const [preference, field] of [
      ["activities", "activities"],
      ["environments", "environments"],
      ["discoveries", "discoveries"],
      ["mood", "moods"]
    ]) {
      const selected = selections(preference);
      score += WEIGHTS[preference] * matchRatio(selected, trip[field]);
      reasons.push(...commonValues(selected, trip[field]));
    }

    const regionMatch = selections("region").includes(ANYWHERE) || selections("region").includes(trip.region);
    const durationMatch = selections("duration").includes(trip.durationGroup);

    if (regionMatch) {
      score += WEIGHTS.region;
      if (!selections("region").includes(ANYWHERE)) reasons.push(trip.region);
    }
    if (durationMatch) {
      score += WEIGHTS.duration;
      reasons.push(trip.durationGroup);
    }

    if (knownTextRules.length) {
      const textMatches = knownTextRules.filter(rule => (trip[rule.field] || []).includes(rule.value));
      score = score * 0.95 + 5 * textMatches.length / knownTextRules.length;
      reasons.push(...textMatches.map(rule => rule.value));
    }

    return {
      trip,
      score,
      percent: Math.round(Math.max(0, Math.min(100, score))),
      reasons: [...new Set(reasons)],
      regionMatch,
      durationMatch
    };
  }

  function rankTrips() {
    return trips.filter(isSuitable).map(scoreTrip).sort((a, b) =>
      b.score - a.score ||
      Number(b.regionMatch) - Number(a.regionMatch) ||
      Number(b.durationMatch) - Number(a.durationMatch) ||
      a.trip.title.localeCompare(b.trip.title)
    );
  }

  function makeVisual(trip) {
    const colorIndex = colorByTripId.get(trip.id) || 0;
    return makeElement("div", `trip-visual ${COLORS[colorIndex % COLORS.length]}`);
  }

  function makeMatchBadge(percent) {
    const badge = makeElement("span", "match-badge");
    badge.setAttribute("aria-label", `${percent}% match`);
    badge.append(makeElement("strong", "", `${percent}%`), document.createTextNode(" match"));
    return badge;
  }

  function makeMeta(trip) {
    const meta = makeElement("div", "trip-meta");
    for (const detail of [trip.durationGroup, trip.level, `${trip.uphill} terrain`]) {
      meta.append(makeElement("span", "meta-pill", detail));
    }
    return meta;
  }

  function makeTags(item, limit = 3) {
    const tags = makeElement("div", "matching-characteristics");
    if (!item.reasons.length) {
      tags.append(makeElement("span", "matching-empty", "Suitable for your experience and terrain"));
      return tags;
    }

    for (const reason of item.reasons.slice(0, limit)) {
      tags.append(makeElement("span", "matching-tag", `✓ ${reason}`));
    }
    if (item.reasons.length > limit) {
      tags.append(makeElement("span", "matching-tag", `+${item.reasons.length - limit} more`));
    }
    return tags;
  }

  function updateDialogSave() {
    if (!currentDetail) return;
    const saved = favorites.has(currentDetail.trip.id);
    ui.dialogSave.textContent = saved ? "♥ Saved — remove" : "♡ Save adventure";
    ui.dialogSave.setAttribute("aria-pressed", String(saved));
  }

  function showDetails(item) {
    currentDetail = item;
    const { trip } = item;

    ui.dialogArt.replaceChildren(makeVisual(trip));
    ui.dialogMatch.replaceChildren(makeMatchBadge(item.percent));
    ui.dialogTitle.textContent = trip.title;
    ui.dialogLocation.textContent = trip.location;
    ui.dialogSummary.textContent = trip.summary;
    ui.dialogStats.replaceChildren(...makeMeta(trip).children);
    ui.dialogTags.replaceChildren(...makeTags(item, Infinity).children);
    ui.dialogHighlights.replaceChildren(...(trip.highlights || []).map(value => makeElement("li", "", value)));
    ui.dialogSafety.textContent = trip.safety;

    updateDialogSave();
    ui.dialog.showModal();
  }

  function saveFavorites() {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    } catch (error) {
      console.warn("Unable to save adventures.", error);
    }
  }

  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    saveFavorites();
    renderResults();
    updateDialogSave();
  }

  function makeCard(item, featured = false) {
    const { trip } = item;
    const card = makeElement("article", featured ? "featured-card" : "trip-card");
    const content = makeElement("div", featured ? "featured-content" : "trip-card-body");
    const top = makeElement("div", "trip-card-top");
    top.append(makeElement("p", "trip-location", trip.location), makeMatchBadge(item.percent));

    if (featured) content.append(makeElement("p", "featured-kicker", "YOUR FEATURED ADVENTURE"));

    content.append(
      top,
      makeElement("h3", "", trip.title),
      makeElement("p", featured ? "featured-summary" : "trip-card-summary", trip.summary),
      makeMeta(trip),
      makeTags(item)
    );

    const differences = [];
    if (!item.regionMatch) differences.push("Outside your selected regions");
    if (!item.durationMatch) differences.push("Different from your preferred duration");
    if (differences.length) content.append(makeElement("p", "alternative-note", differences.join(" · ")));

    const actions = makeElement("div", "trip-actions");
    actions.append(makeButton("Explore details ↗", "primary-btn", () => showDetails(item)));

    const saved = favorites.has(trip.id);
    const save = makeButton(
      saved ? "♥ Saved" : "♡ Save",
      `secondary-btn save-btn${saved ? " is-saved" : ""}`,
      () => toggleFavorite(trip.id)
    );
    save.setAttribute("aria-pressed", String(saved));
    save.setAttribute("aria-label", `${saved ? "Remove" : "Save"} ${trip.title}${saved ? " from saved adventures" : ""}`);
    actions.append(save);
    content.append(actions);

    if (featured) card.append(content, makeVisual(trip));
    else card.append(makeVisual(trip), content);
    return card;
  }

  function renderProfile() {
    const labels = [
      first("experience"),
      ...selections("duration").slice(0, 2),
      ...selections("region").slice(0, 2),
      ...selections("activities").slice(0, 2),
      ...selections("uphill").slice(0, 1)
    ];
    ui.profile.replaceChildren(...labels.map(label => makeElement("span", "profile-pill", label)));
  }

  function renderCategories() {
    const categories = ["All", ...new Set(rankedTrips.map(item => item.trip.category)), SAVED_CATEGORY];
    ui.categories.replaceChildren(...categories.map(category => {
      const active = selectedCategory === category;
      const chip = makeButton(category, `filter-chip${active ? " active" : ""}`, () => {
        selectedCategory = category;
        renderCategories();
        renderResults();
      });
      chip.setAttribute("aria-pressed", String(active));
      return chip;
    }));
  }

  function showEmptyState() {
    ui.empty.hidden = false;
    ui.clear.hidden = selectedCategory === "All";
    ui.edit.hidden = selectedCategory !== "All";
    if (selectedCategory === SAVED_CATEGORY) {
      ui.emptyTitle.textContent = "No saved adventures yet.";
      ui.emptyDescription.textContent = "Save an experience to find it here later.";
    } else if (selectedCategory === "All") {
      ui.emptyTitle.textContent = "No suitable adventures found.";
      ui.emptyDescription.textContent = "Try adjusting your experience level or terrain preferences.";
    } else {
      ui.emptyTitle.textContent = "No adventures in this category.";
      ui.emptyDescription.textContent = "Try another activity category.";
    }
    ui.message.textContent = "";
  }

  function renderResults() {
    const results = rankedTrips.filter(item =>
      selectedCategory === "All" ||
      (selectedCategory === SAVED_CATEGORY
        ? favorites.has(item.trip.id)
        : item.trip.category === selectedCategory)
    );

    ui.count.textContent = `(${results.length})`;
    ui.featured.replaceChildren();
    ui.grid.replaceChildren();
    ui.empty.hidden = results.length > 0;
    ui.alternatives.hidden = results.length < 2;

    if (!results.length) {
      showEmptyState();
      return;
    }

    ui.featured.append(makeCard(results[0], true));
    ui.grid.append(...results.slice(1).map(item => makeCard(item)));

    const alternatives = results.some(item => !item.regionMatch || !item.durationMatch);
    ui.message.textContent = selectedCategory === SAVED_CATEGORY
      ? "Your saved adventures, ranked by compatibility."
      : alternatives
        ? "Ranked by compatibility. Some suitable alternatives are outside your preferred region or duration."
        : "Ranked by compatibility with your nature profile.";
  }

  function validPreferences() {
    const required = ["activities", "duration", "mood", "experience", "region", "environments", "uphill", "discoveries"];
    return preferences?.questionnaireVersion === QUESTIONNAIRE_VERSION &&
      required.every(key => selections(key).length > 0) &&
      EXPERIENCE_RANK[first("experience")] !== undefined;
  }

  function initialize() {
    if (!validPreferences()) {
      ui.error.hidden = false;
      return;
    }

    if (!trips.length) {
      ui.error.hidden = false;
      ui.error.querySelector("h2").textContent = "Could not load adventures.";
      ui.error.querySelector("p").textContent = "Check that data/trips.js exists and loads before recommendations.js.";
      return;
    }

    rankedTrips = rankTrips();
    colorByTripId = new Map(rankedTrips.map((item, index) => [item.trip.id, index]));
    renderProfile();
    renderCategories();
    renderResults();
    ui.app.hidden = false;
  }

  ui.clear.addEventListener("click", () => {
    selectedCategory = "All";
    renderCategories();
    renderResults();
  });
  ui.dialogClose.addEventListener("click", () => ui.dialog.close());
  ui.dialogSave.addEventListener("click", () => {
    if (currentDetail) toggleFavorite(currentDetail.trip.id);
  });
  ui.dialog.addEventListener("click", event => {
    if (event.target === ui.dialog) ui.dialog.close();
  });

  initialize();
})();
