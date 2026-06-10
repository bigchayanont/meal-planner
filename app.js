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
const friendNameInput = document.querySelector("#friendName");
const friendColorInput = document.querySelector("#friendColor");
const profileCount = document.querySelector("#profileCount");
const syncStatus = document.querySelector("#syncStatus");
const statusPanel = document.querySelector(".status-panel");
const weekRange = document.querySelector("#weekRange");
const seedButton = document.querySelector("#seedButton");
const resetWeekButton = document.querySelector("#resetWeekButton");

const state = {
  friends: {},
  attendance: {}
};

let db = null;

function getWeekDates() {
  const today = new Date();
  const start = new Date(today);
  const diff = (today.getDay() + 6) % 7;
  start.setDate(today.getDate() - diff);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: DAYS }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

const weekDates = getWeekDates();

function formatWeekLabel() {
  const first = weekDates[0];
  const last = weekDates[weekDates.length - 1];
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  });
  return `${formatter.format(first)} - ${formatter.format(last)}`;
}

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

function mealKey(date, meal) {
  return `${dayKey(date)}_${meal.toLowerCase()}`;
}

function sanitizeText(value) {
  return value.replace(/[<>]/g, "").trim();
}

function setStatus(message, connected = false) {
  syncStatus.textContent = message;
  statusPanel.classList.toggle("connected", connected);
}

function createInitialAttendance() {
  const nextAttendance = {};
  weekDates.forEach((date) => {
    MEALS.forEach((meal) => {
      nextAttendance[mealKey(date, meal)] = {};
    });
  });
  return nextAttendance;
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
          ${mealCards}
        </section>
      `;
    })
    .join("");
}

function render() {
  renderFriends();
  renderPlanner();
}

async function addFriend(name, color) {
  const newFriendRef = push(ref(db, "planner/friends"));
  await set(newFriendRef, { name, color });
}

async function removeFriendProfile(friendId) {
  await remove(ref(db, `planner/friends/${friendId}`));

  const cleanup = {};
  Object.keys(state.attendance).forEach((key) => {
    cleanup[`planner/attendance/${key}/${friendId}`] = null;
  });
  await update(ref(db), cleanup);
}

async function toggleAttendance(friendId, selectedMealKey) {
  const currentValue = Boolean(state.attendance[selectedMealKey]?.[friendId]);
  await set(ref(db, `planner/attendance/${selectedMealKey}/${friendId}`), !currentValue);
}

async function ensureWeekStructure() {
  await update(ref(db, "planner/attendance"), createInitialAttendance());
}

async function seedSampleFriends() {
  const existingFriends = Object.keys(state.friends).length;
  if (existingFriends) {
    return;
  }

  await Promise.all(FALLBACK_SAMPLE_FRIENDS.map((friend) => addFriend(friend.name, friend.color)));
}

async function resetAttendance() {
  await set(ref(db, "planner/attendance"), createInitialAttendance());
}

function bindEvents() {
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

  resetWeekButton.addEventListener("click", async () => {
    if (db) {
      await resetAttendance();
    }
  });
}

async function loadFirebase() {
  weekRange.textContent = formatWeekLabel();

  try {
    const { firebaseConfig } = await import("./firebase-config.js");

    const app = initializeApp(firebaseConfig);
    db = getDatabase(app);
    const plannerRef = ref(db, "planner");

    await ensureWeekStructure();

    onValue(plannerRef, (snapshot) => {
      const data = snapshot.val() || {};
      state.friends = data.friends || {};
      state.attendance = { ...createInitialAttendance(), ...(data.attendance || {}) };
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
