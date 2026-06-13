import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const FALLBACK_SAMPLE_FRIENDS = [
  { name: "Mina", color: "#ff8a5b" },
  { name: "Jay", color: "#4db6ac" },
  { name: "Noah", color: "#6c8cff" },
  { name: "Belle", color: "#f4b942" },
  { name: "Sam", color: "#d06fe8" }
];

const MEALS = ["Lunch", "Dinner"];
const DAYS = 7;
const plannerGrid = document.querySelector("#plannerGrid");
const friendsList = document.querySelector("#friendsList");
const friendForm = document.querySelector("#friendForm");
const eventForm = document.querySelector("#eventForm");
const eventSelect = document.querySelector("#eventSelect");
const eventNameInput = document.querySelector("#eventName");
const friendNameInput = document.querySelector("#friendName");
const friendColorInput = document.querySelector("#friendColor");
const profileCount = document.querySelector("#profileCount");
const syncStatus = document.querySelector("#syncStatus");
const statusPanel = document.querySelector(".status-panel");
const weekRange = document.querySelector("#weekRange");
const weekSelect = document.querySelector("#weekSelect");
const summaryWeekSelect = document.querySelector("#summaryWeekSelect");
const summarizeButton = document.querySelector("#summarizeButton");
const summaryResults = document.querySelector("#summaryResults");
const seedButton = document.querySelector("#seedButton");
const resetWeekButton = document.querySelector("#resetWeekButton");
const deleteEventButton = document.querySelector("#deleteEventButton");

const state = {
  events: {},
  currentEventId: "",
  friends: {},
  attendance: {},
  selectedWeekStart: "",
  weekOptions: [],
  summaryWeekStarts: [],
  summaryGenerated: false
};

let db = null;
let rootData = {};

function slugifyEventName(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || `event-${Date.now()}`;
}

function currentEventPath() {
  return `plannerEvents/${state.currentEventId}`;
}

function getStartOfWeek(baseDate = new Date()) {
  const start = new Date(baseDate);
  const diff = (baseDate.getDay() + 6) % 7;
  start.setDate(baseDate.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekDates(weekStart = getStartOfWeek()) {
  return Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    return date;
  });
}

function formatWeekLabel(weekDates) {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  });
  return `${formatter.format(first)} - ${formatter.format(last)}`;
}

function dayKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mealKey(date, meal) {
  return `${dayKey(date)}_${meal.toLowerCase()}`;
}

function getSelectedWeekDates() {
  const fallback = getStartOfWeek();
  const selectedStart = state.selectedWeekStart || dayKey(fallback);
  return getWeekDates(new Date(`${selectedStart}T00:00:00`));
}

function createWeekOptions() {
  const currentStart = getStartOfWeek();
  return Array.from({ length: 12 }, (_, index) => {
    const weekStart = new Date(currentStart);
    weekStart.setDate(currentStart.getDate() + index * 7);
    const dates = getWeekDates(weekStart);
    const prefix = index === 0 ? "This week" : index === 1 ? "Next week" : `Week ${index + 1}`;
    return {
      key: dayKey(weekStart),
      label: `${prefix} · ${formatWeekLabel(dates)}`
    };
  });
}

function sanitizeText(value) {
  return value.replace(/[<>]/g, "").trim();
}

function setStatus(message, connected = false) {
  syncStatus.textContent = message;
  statusPanel.classList.toggle("connected", connected);
}

function renderEventSelect() {
  const eventEntries = Object.entries(state.events);
  eventSelect.innerHTML = eventEntries
    .map(
      ([eventId, eventInfo]) => `
        <option value="${eventId}" ${eventId === state.currentEventId ? "selected" : ""}>
          ${eventInfo.name}
        </option>
      `
    )
    .join("");
}

function createInitialAttendance(weekDates = getSelectedWeekDates()) {
  const nextAttendance = {};
  weekDates.forEach((date) => {
    MEALS.forEach((meal) => {
      nextAttendance[mealKey(date, meal)] = {};
    });
  });
  return nextAttendance;
}

function renderWeekSelect() {
  weekSelect.innerHTML = state.weekOptions
    .map(
      (option) => `
        <option value="${option.key}" ${option.key === state.selectedWeekStart ? "selected" : ""}>
          ${option.label}
        </option>
      `
    )
    .join("");
}

function renderSummaryWeekSelect() {
  summaryWeekSelect.innerHTML = state.weekOptions
    .map(
      (option) => `
        <option value="${option.key}" ${state.summaryWeekStarts.includes(option.key) ? "selected" : ""}>
          ${option.label}
        </option>
      `
    )
    .join("");
}

function buildSummaryRows() {
  return state.summaryWeekStarts
    .flatMap((weekStartKey) => {
      const weekDates = getWeekDates(new Date(`${weekStartKey}T00:00:00`));
      return weekDates.flatMap((date) => {
        return MEALS.map((meal) => {
          const key = mealKey(date, meal);
          const attendanceMap = state.attendance[key] || {};
          const attendees = Object.entries(state.friends)
            .filter(([friendId]) => attendanceMap[friendId])
            .map(([, friend]) => friend.name);

          return {
            dateLabel: new Intl.DateTimeFormat(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric"
            }).format(date),
            meal,
            attendeeNames: attendees,
            count: attendees.length
          };
        });
      });
    })
    .filter((row) => row.count > 0)
    .sort((left, right) => right.count - left.count || left.dateLabel.localeCompare(right.dateLabel) || left.meal.localeCompare(right.meal))
    .slice(0, 10);
}

function renderSummary() {
  if (!state.summaryGenerated) {
    summaryResults.innerHTML = '<p class="helper-copy">No summary yet. Choose weeks and tap Summarize.</p>';
    return;
  }

  if (!state.summaryWeekStarts.length) {
    summaryResults.innerHTML = '<p class="helper-copy">Select at least one week to build the summary.</p>';
    return;
  }

  const rows = buildSummaryRows();
  if (!rows.length) {
    summaryResults.innerHTML = '<p class="helper-copy">No attendance found for the selected weeks yet.</p>';
    return;
  }

  summaryResults.innerHTML = `
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th class="summary-rank">Rank</th>
            <th>Date</th>
            <th>Meal</th>
            <th>Attending</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (row, index) => `
                <tr>
                  <td class="summary-count">#${index + 1}</td>
                  <td class="summary-count">${row.dateLabel}</td>
                  <td>${row.meal}</td>
                  <td>${row.attendeeNames.length ? row.attendeeNames.join(", ") : "No one yet"}</td>
                  <td class="summary-count">${row.count}</td>
                </tr>
              `
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderFriends() {
  const friends = Object.entries(state.friends);
  profileCount.textContent = String(friends.length);

  if (!friends.length) {
    friendsList.innerHTML = '<p class="helper-copy">No profiles yet. Add your friends to get started.</p>';
    return;
  }

  friendsList.innerHTML = friends
    .map(
      ([id, friend]) => `
        <article class="friend-card">
          <div class="friend-meta">
            <span class="avatar-dot" style="background:${friend.color}"></span>
            <div>
              <strong>${friend.name}</strong>
              <p class="attendance-count">Shared editor</p>
            </div>
          </div>
          <button class="small-button" type="button" data-remove-friend="${id}">Remove</button>
        </article>
      `
    )
    .join("");
}

function renderPlanner() {
  const friendEntries = Object.entries(state.friends);
  const weekDates = getSelectedWeekDates();

  plannerGrid.innerHTML = weekDates
    .map((date) => {
      const label = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric"
      }).format(date);

      const mealCards = MEALS.map((meal) => {
        const key = mealKey(date, meal);
        const attendanceMap = state.attendance[key] || {};
        const count = Object.values(attendanceMap).filter(Boolean).length;

        const chips = friendEntries.length
          ? friendEntries
              .map(([friendId, friend]) => {
                const active = Boolean(attendanceMap[friendId]);
                const style = active
                  ? `background:${friend.color};`
                  : `border:1px solid ${friend.color}; color:${friend.color}; background:rgba(255,255,255,0.9);`;

                return `
                  <button
                    class="chip-button ${active ? "active" : ""}"
                    type="button"
                    data-meal-key="${key}"
                    data-friend-id="${friendId}"
                    style="${style}"
                  >
                    ${friend.name}
                  </button>
                `;
              })
              .join("")
          : '<p class="attendance-count">Add profiles to start marking attendance.</p>';

        return `
          <article class="meal-card">
            <h3>${meal}</h3>
            <p class="attendance-count">${count} attending</p>
            <div class="chips-wrap">${chips}</div>
          </article>
        `;
      }).join("");

      return `
        <section class="day-column">
          <div class="day-header">
            <strong>${label}</strong>
          </div>
          <div class="day-meals">
            ${mealCards}
          </div>
        </section>
      `;
    })
    .join("");
}

function render() {
  const weekDates = getSelectedWeekDates();
  weekRange.textContent = formatWeekLabel(weekDates);
  renderEventSelect();
  renderWeekSelect();
  renderSummaryWeekSelect();
  renderFriends();
  renderPlanner();
  renderSummary();
}

async function addFriend(name, color) {
  const newFriendRef = push(ref(db, `${currentEventPath()}/friends`));
  await set(newFriendRef, { name, color });
}

async function removeFriendProfile(friendId) {
  await remove(ref(db, `${currentEventPath()}/friends/${friendId}`));

  const cleanup = {};
  Object.keys(state.attendance).forEach((key) => {
    cleanup[`${currentEventPath()}/attendance/${key}/${friendId}`] = null;
  });
  await update(ref(db), cleanup);
}

async function toggleAttendance(friendId, selectedMealKey) {
  const currentValue = Boolean(state.attendance[selectedMealKey]?.[friendId]);
  await set(ref(db, `${currentEventPath()}/attendance/${selectedMealKey}/${friendId}`), !currentValue);
}

async function createEvent(name) {
  const eventId = slugifyEventName(name);
  const eventExists = Boolean(state.events[eventId]);
  if (eventExists) {
    state.currentEventId = eventId;
    render();
    return;
  }

  const payload = {
    [`plannerMeta/events/${eventId}`]: { name },
    [`plannerEvents/${eventId}`]: {
      name,
      friends: {},
      attendance: {}
    }
  };

  await update(ref(db), payload);
  state.currentEventId = eventId;
}

async function deleteCurrentEvent() {
  const eventIds = Object.keys(state.events);
  if (eventIds.length <= 1) {
    window.alert("You need to keep at least one event.");
    return;
  }

  const eventId = state.currentEventId;
  const eventName = state.events[eventId]?.name || eventId;
  const confirmed = window.confirm(`Delete "${eventName}" and all its attendance data?`);
  if (!confirmed) {
    return;
  }

  const nextEventId = eventIds.find((id) => id !== eventId) || "";
  await update(ref(db), {
    [`plannerMeta/events/${eventId}`]: null,
    [`plannerEvents/${eventId}`]: null
  });
  state.currentEventId = nextEventId;
}

async function seedSampleFriends() {
  const existingFriends = Object.keys(state.friends).length;
  if (existingFriends) {
    return;
  }

  await Promise.all(FALLBACK_SAMPLE_FRIENDS.map((friend) => addFriend(friend.name, friend.color)));
}

async function resetAttendance() {
  const updates = {};
  Object.keys(createInitialAttendance()).forEach((key) => {
    updates[`${currentEventPath()}/attendance/${key}`] = {};
  });
  await update(ref(db), updates);
}

function syncCurrentEventState(data) {
  const metaEvents = data.plannerMeta?.events || {};
  const eventRecords = data.plannerEvents || {};
  const mergedEvents = { ...metaEvents };

  Object.entries(eventRecords).forEach(([eventId, eventData]) => {
    if (!mergedEvents[eventId]) {
      mergedEvents[eventId] = {
        name: eventData.name || eventId
      };
    }
  });

  state.events = mergedEvents;

  const fallbackEventId = Object.keys(mergedEvents)[0] || "";
  if (!state.currentEventId || !mergedEvents[state.currentEventId]) {
    state.currentEventId = fallbackEventId;
  }

  const eventData = data.plannerEvents?.[state.currentEventId] || {};
  state.friends = eventData.friends || {};
  state.attendance = { ...createInitialAttendance(), ...(eventData.attendance || {}) };
}

async function ensureEventStructure(data) {
  if (data.plannerMeta?.events && data.plannerEvents) {
    return;
  }

  const legacyFriends = data.planner?.friends || {};
  const legacyAttendance = data.planner?.attendance || {};
  const defaultEventId = "bigs-apt";

  await update(ref(db), {
    [`plannerMeta/events/${defaultEventId}`]: { name: "Big's apt" },
    [`plannerEvents/${defaultEventId}`]: {
      name: "Big's apt",
      friends: legacyFriends,
      attendance: legacyAttendance
    }
  });
}

function bindEvents() {
  eventForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = sanitizeText(eventNameInput.value);
    if (!name || !db) {
      return;
    }

    await createEvent(name);
    eventForm.reset();
  });

  eventSelect.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    state.currentEventId = target.value;
    syncCurrentEventState(rootData);
    render();
  });

  friendForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = sanitizeText(friendNameInput.value);
    const color = friendColorInput.value;

    if (!name || !db) {
      return;
    }

    await addFriend(name, color);
    friendForm.reset();
    friendColorInput.value = "#ff8a5b";
  });

  friendsList.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const friendId = target.dataset.removeFriend;
    if (friendId && db) {
      await removeFriendProfile(friendId);
    }
  });

  plannerGrid.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const friendId = target.dataset.friendId;
    const selectedMealKey = target.dataset.mealKey;
    if (friendId && selectedMealKey && db) {
      await toggleAttendance(friendId, selectedMealKey);
    }
  });

  seedButton.addEventListener("click", async () => {
    if (db) {
      await seedSampleFriends();
    }
  });

  weekSelect.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    state.selectedWeekStart = target.value;
    render();
  });

  summaryWeekSelect.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    state.summaryWeekStarts = Array.from(target.selectedOptions, (option) => option.value);
    if (state.summaryGenerated) {
      renderSummary();
    }
  });

  summarizeButton.addEventListener("click", () => {
    state.summaryGenerated = true;
    state.summaryWeekStarts = Array.from(summaryWeekSelect.selectedOptions, (option) => option.value);
    renderSummary();
  });

  resetWeekButton.addEventListener("click", async () => {
    if (db && window.confirm(`Reset all attendance for ${formatWeekLabel(getSelectedWeekDates())}?`)) {
      await resetAttendance();
    }
  });

  deleteEventButton.addEventListener("click", async () => {
    if (db && state.currentEventId) {
      await deleteCurrentEvent();
    }
  });
}

async function loadFirebase() {
  state.weekOptions = createWeekOptions();
  state.selectedWeekStart = state.weekOptions[0]?.key || dayKey(getStartOfWeek());
  state.summaryWeekStarts = state.weekOptions.slice(0, 1).map((option) => option.key);
  render();

  try {
    const { firebaseConfig } = await import("./firebase-config.js");

    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    const plannerRef = ref(db, "/");

    onValue(plannerRef, (snapshot) => {
      const data = snapshot.val() || {};
      rootData = data;

      if ((!data.plannerMeta?.events || !data.plannerEvents) && db) {
        ensureEventStructure(data).catch((error) => {
          console.error(error);
          setStatus("Connected, but there was a problem preparing events.");
        });
      }

      syncCurrentEventState(data);
      render();
    });

    setStatus("Connected. Everyone on the same Firebase project can view and edit live.", true);
  } catch (error) {
    console.error(error);
    state.attendance = createInitialAttendance();
    render();
    setStatus("Firebase is not configured yet. Copy firebase-config.example.js to firebase-config.js and add your project keys.");
  }
}

bindEvents();
loadFirebase();
