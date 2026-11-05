"use strict";

(() => {
  const QUESTIONS = [
    {
      id: "activities",
      title: "Which outdoor activities would you like to experience?",
      description: "Select all the experiences you'd like to try.",
      type: "multiple",
      options: ["Hiking", "Climbing", "Sea adventures", "Wildlife watching", "Camping", "Cycling", "Nature photography"]
    },
    {
      id: "duration",
      title: "How long would you like your adventure to last?",
      description: "Select all your preferred adventure durations.",
      type: "multiple",
      options: ["Under 2 hours", "2-4 hours", "4-6 hours", "Full day", "Multiple days"]
    },
    {
      id: "mood",
      title: "What are you hoping to feel on your next adventure?",
      description: "What are you looking for in your next escape?",
      type: "multiple",
      options: ["Peace & relaxation", "Excitement & energy", "Inspiration", "Curiosity & adventure", "Reconnection with nature"]
    },
    {
      id: "experience",
      title: "What's your experience level?",
      description: "Choose your outdoor experience level.",
      type: "single",
      options: ["Beginner", "Intermediate", "Advanced"]
    },
    {
      id: "region",
      title: "Which parts of Greece would you like to explore?",
      description: "Select all the regions you'd like to discover.",
      type: "multiple",
      options: ["Anywhere in Greece", "Attica", "Central Greece", "Peloponnese", "Thessaly", "Epirus", "Macedonia", "Thrace", "Ionian Islands", "Aegean Islands", "Crete"]
    },
    {
      id: "environments",
      title: "Which natural environments make you feel most alive?",
      description: "Select the landscapes you're drawn to.",
      type: "multiple",
      options: ["Forests", "Mountains", "Beaches & sea", "Lakes & rivers", "Caves & canyons", "Open landscapes"]
    },
    {
      id: "uphill",
      title: "Which types of terrain are you comfortable with?",
      description: "Select all the terrain types you're happy to explore.",
      type: "multiple",
      options: ["Flat terrain / no uphill", "Gentle slopes", "Moderate uphill", "Steep climbs"]
    },
    {
      id: "discoveries",
      title: "What would you love to discover along the way?",
      description: "Choose everything that sparks your curiosity.",
      type: "multiple",
      options: ["Birds", "Wild animals", "Mushrooms", "Rare plants", "Waterfalls", "Geological formations", "Hidden viewpoints", "Marine Life", "Wildflowers", "Butterflies & insects", "Ancient trees", "Caves", "Natural springs", "Sea turtles", "Dolphins", "Starry skies"]
    },
    {
      id: "freeText",
      title: "Describe your perfect nature escape.",
      description: "Is there anything else you'd like us to know?",
      type: "text",
      options: []
    }
  ];

  // Keep version 5 so existing completed profiles remain compatible.
  const VERSION = 5;
  const FINAL_KEY = "humanaturePreferences";
  const DRAFT_KEY = "humanatureDraftPreferences";
  const ANYWHERE = "Anywhere in Greece";

  const ui = {
    title: document.getElementById("question-title"),
    description: document.getElementById("question-description"),
    eyebrow: document.getElementById("question-eyebrow"),
    options: document.getElementById("options-container"),
    textContainer: document.getElementById("text-answer-container"),
    freeText: document.getElementById("free-text-answer"),
    counter: document.getElementById("step-counter"),
    progress: document.getElementById("progress-bar"),
    progressTrack: document.getElementById("progress-track"),
    previous: document.getElementById("previous-btn"),
    next: document.getElementById("next-btn")
  };

  function readStoredAnswers() {
    for (const key of [DRAFT_KEY, FINAL_KEY]) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) || "null");
        if (stored && stored.questionnaireVersion === VERSION) return stored;
      } catch (error) {
        console.warn(`Unable to read ${key}.`, error);
      }
    }
    return {};
  }

  const stored = readStoredAnswers();
  const answers = Object.fromEntries(QUESTIONS.map(question => {
    if (question.type === "text") {
      return [question.id, typeof stored[question.id] === "string" ? stored[question.id] : ""];
    }

    const values = Array.isArray(stored[question.id]) ? stored[question.id] : [];
    let valid = [...new Set(values.filter(value => question.options.includes(value)))];
    if (question.type === "single") valid = valid.slice(0, 1);
    if (question.id === "region" && valid.includes(ANYWHERE)) valid = [ANYWHERE];
    return [question.id, valid];
  }));

  let stepIndex = 0;

  function persist(key) {
    sessionStorage.setItem(key, JSON.stringify({ ...answers, questionnaireVersion: VERSION }));
  }

  function saveDraft() {
    try {
      persist(DRAFT_KEY);
    } catch (error) {
      console.warn("Unable to save questionnaire draft.", error);
    }
  }

  function updateNextButton() {
    const question = QUESTIONS[stepIndex];
    ui.next.disabled = question.type !== "text" && answers[question.id].length === 0;
  }

  function updateOptionStates() {
    const selected = answers[QUESTIONS[stepIndex].id];
    for (const option of ui.options.children) {
      const active = selected.includes(option.dataset.value);
      option.classList.toggle("selected", active);
      option.setAttribute("aria-pressed", String(active));
    }
    updateNextButton();
  }

  function toggleOption(question, value) {
    const selected = answers[question.id];

    if (question.type === "single") {
      answers[question.id] = [value];
    } else if (selected.includes(value)) {
      answers[question.id] = selected.filter(item => item !== value);
    } else if (question.id === "region") {
      answers.region = value === ANYWHERE
        ? [ANYWHERE]
        : [...selected.filter(item => item !== ANYWHERE), value];
    } else {
      answers[question.id] = [...selected, value];
    }

    updateOptionStates(); // Preserve keyboard focus when selecting an option.
    saveDraft();
  }

  function renderQuestion(moveFocus = false) {
    const question = QUESTIONS[stepIndex];
    const isText = question.type === "text";

    ui.title.textContent = question.title;
    ui.description.textContent = question.description;
    ui.eyebrow.textContent = isText ? "ONE LAST THING..." : "YOUR NATURE PROFILE";
    ui.counter.textContent = `${String(stepIndex + 1).padStart(2, "0")} / ${String(QUESTIONS.length).padStart(2, "0")}`;
    ui.progress.style.width = `${((stepIndex + 1) / QUESTIONS.length) * 100}%`;
    ui.progressTrack.setAttribute("aria-valuenow", String(stepIndex + 1));
    ui.progressTrack.setAttribute("aria-valuemax", String(QUESTIONS.length));

    ui.options.hidden = isText;
    ui.textContainer.hidden = !isText;
    ui.options.replaceChildren();

    if (isText) {
      ui.freeText.value = answers.freeText;
    } else {
      for (const value of question.options) {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "option-card";
        option.dataset.value = value;
        option.textContent = value;
        option.addEventListener("click", () => toggleOption(question, value));
        ui.options.append(option);
      }
      updateOptionStates();
    }

    ui.previous.hidden = stepIndex === 0;
    ui.next.textContent = isText ? "Find My Adventures →" : "Continue →";
    updateNextButton();

    if (moveFocus) {
      window.scrollTo(0, 0);
      ui.title.focus({ preventScroll: true });
    }
  }

  ui.freeText.addEventListener("input", () => {
    answers.freeText = ui.freeText.value;
    saveDraft();
  });

  ui.previous.addEventListener("click", () => {
    if (stepIndex > 0) {
      stepIndex -= 1;
      renderQuestion(true);
    }
  });

  ui.next.addEventListener("click", () => {
    if (ui.next.disabled) return;

    if (stepIndex < QUESTIONS.length - 1) {
      stepIndex += 1;
      renderQuestion(true);
      return;
    }

    try {
      persist(FINAL_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
      window.location.assign("recommendations.html");
    } catch (error) {
      console.error("Unable to save questionnaire answers.", error);
      window.alert("Your answers could not be saved. Please try again.");
    }
  });

  renderQuestion();
})();
