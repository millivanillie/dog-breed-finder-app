const API_BASE = "https://api.thedogapi.com/v1";
const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const suggestionsEl = document.getElementById("suggestions");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");
const apiKeyInput = document.getElementById("apiKeyInput");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const keyDetails = document.getElementById("keyDetails");

function getKey() {
  return "live_QGUn7j7SVVB7yP9ULAMzfkrJxyce2jZqQuUsuYl8LMfMIt9rTFxGtTLOrQ8rWU16";
}

// Key is hardcoded above, so the "API key" field/button in index.html
// is no longer needed — you can remove that block from the HTML if you want.
keyDetails.style.display = "none";

function headers() {
  const k = getKey();
  return k ? { "x-api-key": k } : {};
}

async function fetchBreeds(query) {
  const res = await fetch(`${API_BASE}/breeds/search?q=${encodeURIComponent(query)}`, { headers: headers() });
  if (!res.ok) throw new Error(res.status === 401 ? "Missing or invalid API key" : `Request failed (${res.status})`);
  return res.json();
}

function imageUrl(breed) {
  if (breed.image && breed.image.url) return breed.image.url;
  if (breed.reference_image_id) return `https://cdn2.thedogapi.com/images/${breed.reference_image_id}.jpg`;
  return null;
}

function renderCard(breed) {
  const img = imageUrl(breed);
  resultEl.innerHTML = `
    <div class="card">
      ${img ? `<img src="${img}" alt="${breed.name}">` : ""}
      <div class="body">
        <h2>${breed.name}</h2>
        <p class="origin">${breed.origin || "Origin unknown"}${breed.breed_group ? " · " + breed.breed_group : ""}</p>
        <div class="facts">
          <div class="fact"><div class="label">Temperament</div><div class="value">${breed.temperament || "—"}</div></div>
          <div class="fact"><div class="label">Life span</div><div class="value">${breed.life_span || "—"}</div></div>
          <div class="fact"><div class="label">Bred for</div><div class="value">${breed.bred_for || "—"}</div></div>
          <div class="fact"><div class="label">Weight</div><div class="value">${breed.weight ? breed.weight.metric + " kg" : "—"}</div></div>
        </div>
      </div>
    </div>`;
}

async function runSearch(query) {
  suggestionsEl.style.display = "none";
  if (!query.trim()) return;
  if (!getKey()) {
    statusEl.textContent = "Add your API key above first.";
    keyDetails.open = true;
    return;
  }
  statusEl.textContent = "Searching…";
  resultEl.innerHTML = "";
  try {
    const breeds = await fetchBreeds(query);
    if (!breeds.length) {
      statusEl.textContent = `No breed matched “${query}.”`;
      return;
    }
    statusEl.textContent = "";
    renderCard(breeds[0]);
  } catch (err) {
    statusEl.textContent = err.message || "Something went wrong.";
  }
}

searchBtn.addEventListener("click", () => runSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => { if (e.key === "Enter") runSearch(searchInput.value); });

let debounceTimer;
searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  const q = searchInput.value.trim();
  if (!q || !getKey()) { suggestionsEl.style.display = "none"; return; }
  debounceTimer = setTimeout(async () => {
    try {
      const breeds = await fetchBreeds(q);
      if (!breeds.length) { suggestionsEl.style.display = "none"; return; }
      breeds.sort((a, b) => a.name.localeCompare(b.name));
      suggestionsEl.innerHTML = breeds.slice(0, 6).map(b =>
        `<button type="button" data-id="${b.id}">${b.name}</button>`
      ).join("");
      suggestionsEl.style.display = "block";
      suggestionsEl.querySelectorAll("button").forEach((btn, i) => {
        btn.addEventListener("click", () => {
          searchInput.value = breeds[i].name;
          suggestionsEl.style.display = "none";
          statusEl.textContent = "";
          renderCard(breeds[i]);
        });
      });
    } catch (e) { /* stay quiet on debounce errors */ }
  }, 300);
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".searchRow")) suggestionsEl.style.display = "none";
});

/* --- "Which breed fits your life?" quiz --- */

const quizToggle = document.getElementById("quizToggle");
const quizPanel = document.getElementById("quizPanel");
const quizForm = document.getElementById("quizForm");
const quizStatusEl = document.getElementById("quizStatus");
const quizResultsEl = document.getElementById("quizResults");

quizToggle.addEventListener("click", () => {
  const opening = quizPanel.hidden;
  quizPanel.hidden = !opening;
  quizToggle.textContent = opening ? "Hide the quiz ↑" : "Not sure where to start? Take the quiz →";
});

let allBreedsCache = null;
async function getAllBreeds() {
  if (allBreedsCache) return allBreedsCache;
  const res = await fetch(`${API_BASE}/breeds`, { headers: headers() });
  if (!res.ok) throw new Error(res.status === 401 ? "Missing or invalid API key" : "Couldn't load the breed list.");
  allBreedsCache = await res.json();
  return allBreedsCache;
}

function parseAvgWeightKg(breed) {
  const metric = breed.weight && breed.weight.metric;
  const nums = metric && metric.match(/[\d.]+/g);
  if (!nums) return null;
  return nums.map(Number).reduce((a, b) => a + b, 0) / nums.length;
}

// Heuristic word lists — temperament is free text, so this is an approximation,
// not a scored trait field from the API.
const HIGH_ENERGY_WORDS = ["Energetic", "Active", "Playful", "Athletic", "Agile", "Lively"];
const LOW_ENERGY_WORDS = ["Calm", "Docile", "Gentle", "Quiet", "Mellow"];
const FAMILY_WORDS = ["Friendly", "Gentle", "Affectionate", "Loyal", "Devoted", "Sociable"];
const INDEPENDENT_WORDS = ["Independent", "Aloof", "Stubborn", "Territorial", "Protective"];

function scoreBreed(breed, answers) {
  const words = (breed.temperament || "").split(",").map(w => w.trim());
  let score = 0;

  const highHits = words.filter(w => HIGH_ENERGY_WORDS.includes(w)).length;
  const lowHits = words.filter(w => LOW_ENERGY_WORDS.includes(w)).length;
  if (answers.energy === "high") score += highHits * 8 - lowHits * 6;
  if (answers.energy === "low") score += lowHits * 8 - highHits * 6;
  if (answers.energy === "moderate") score += 4 - Math.abs(highHits - lowHits) * 2;

  const avgKg = parseAvgWeightKg(breed);
  if (avgKg != null) {
    if (answers.space === "apartment") score += avgKg <= 12 ? 15 : avgKg <= 25 ? 0 : -15;
    if (answers.space === "house_small") score += avgKg > 8 && avgKg <= 30 ? 10 : 0;
    if (answers.space === "house_large") score += avgKg > 20 ? 15 : 0;
  }

  const familyHits = words.filter(w => FAMILY_WORDS.includes(w)).length;
  const indepHits = words.filter(w => INDEPENDENT_WORDS.includes(w)).length;
  if (answers.family === "yes") score += familyHits * 6 - indepHits * 8;

  return score;
}

function renderQuizResults(matches) {
  quizResultsEl.innerHTML = matches.map(b => {
    const img = imageUrl(b);
    const traits = (b.temperament || "").split(",").slice(0, 3).join(", ");
    return `
      <div class="miniCard">
        ${img ? `<img src="${img}" alt="${b.name}">` : ""}
        <div class="miniBody">
          <h3>${b.name}</h3>
          <p>${traits}</p>
        </div>
      </div>`;
  }).join("");
}

quizForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!getKey()) {
    quizStatusEl.textContent = "Add your API key above first.";
    return;
  }
  quizStatusEl.textContent = "Finding your matches…";
  quizResultsEl.innerHTML = "";
  const fd = new FormData(quizForm);
  const answers = {
    energy: fd.get("energy"),
    space: fd.get("space"),
    family: fd.get("family"),
  };
  try {
    const breeds = await getAllBreeds();
    const ranked = breeds
      .map(b => ({ breed: b, score: scoreBreed(b, answers) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(r => r.breed);
    quizStatusEl.textContent = "";
    renderQuizResults(ranked);
  } catch (err) {
    quizStatusEl.textContent = err.message || "Something went wrong.";
  }
});