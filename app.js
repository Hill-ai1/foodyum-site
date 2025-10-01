// ========= Config =========
const cfg = {
  pageVersion: "v2.0.2",
  minReadMs: 5000,
  requireScrollToBottom: true,
  sentenceIntervalMs: 1000,
  sink: "webhook",
  webhookURL: "https://script.google.com/macros/s/AKfycbwo5L2FJppg8l5Ps2J26M7-moeooqmZ5bM9euP4NAaRZZN4mkXW9bJRu_sw8OcX1Uxpjw/exec",
  assignmentMode: "perSession"
};

// ========= Utils =========
const $ = (s) => document.querySelector(s);
const nowISO = () => new Date().toISOString();
const uuid = () => crypto.randomUUID ? crypto.randomUUID() :
  ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g,c=>(c^crypto.getRandomValues(new Uint8Array(1))[0]&15>>c/4).toString(16));
async function sha256(s){const b=new TextEncoder().encode(s);const h=await crypto.subtle.digest("SHA-256",b);return[...new Uint8Array(h)].map(x=>x.toString(16).padStart(2,"0")).join("")}

// ========= Global State =========
const state = {
  participant_id: localStorage.getItem("pid") || (localStorage.setItem("pid", uuid()), localStorage.getItem("pid")),
  session_id: uuid(),
  page_version: cfg.pageVersion,
  tz_offset_min: new Date().getTimezoneOffset(),
  ua_hash: null,
  stimulus: { version:null, openAt:null, canCloseAt:null, closedAt:null, allShownAt:null },
  choice: { id:null, label:null, clickAt:null, rt_ms:null, startAt:null },
  survey: { startAt:null, answers:{} },
  appStart: Date.now()
};

// ========= Stimuli =========
const STIMULI = {
  A: `
    <p><strong>Did you know?</strong> FoodYum Supermarkets now offers a rewards program that encourages environmentally-friendly shopping.</p>
    <p>For every plant-based or low-carbon item you add to your cart, you will receive one entry into a raffle for Amazon gift cards.</p>
    <p>The more eco-friendly choices you make, the more chances you have to win.</p>
  `,
  B: `
    <p><strong>Did you know?</strong> Many consumers report feeling guilty or ashamed after purchasing high-carbon-emission foods.</p>
    <p>At FoodYum Supermarkets, we encourage you to reflect on your decisions: Are you making environmentally responsible choices? Are you shopping like a good citizen?</p>
  `,
  C: `
    <p><strong>Did you know?</strong> Environmentally-friendly shopping isn’t just about products—it reflects your personal commitment to society and the planet.</p>
    <p>If you agree with the value of environmentally-friendly living, please let your choices listen to your values.</p>
    <p>Your shopping behavior at FoodYum Supermarkets is an extension of your good citizenship.</p>
  `
};

const QUESTIONS = [
  { id:"q1", title:"In any community I might live in: It would be more important for me to", a:"Get from the community", b:"Give to the community" },
  { id:"q2", title:"In any community I might live in: It would be more important for me to", a:"Help others", b:"Watch out for my own good" },
  { id:"q3", title:"In any community I might live in: I would be more concerned about", a:"What I received from the community", b:"What I contributed to the community" },
  { id:"q4", title:"In any community I might live in: The hard work I would do should", a:"Benefit the community", b:"Benefit me" },
  { id:"q5", title:"In any community I might live in: My personal philosophy in dealing with the community would be", a:"If I don’t look out for myself, nobody else will", b:"It’s better for me to give than to receive" }
];

// non-food ids: f01..f06
const NONFOOD_SET = new Set(["f01","f02","f03","f04","f05","f06"]);

// ========= Init =========
window.addEventListener("DOMContentLoaded", async () => {
  state.ua_hash = await sha256(navigator.userAgent || "");
  setupModal();
  await loadItems();
  buildQuestions();
});

function pickStimulusVersion() {
  const versions = ["A","B","C"];
  return versions[Math.floor(Math.random()*versions.length)];
}

// ========= Modal with sentence-by-sentence fade =========
function setupModal(){
  const v = pickStimulusVersion();
  state.stimulus.version = v;

  const cont = document.getElementById("stimulusText");
  const status = document.getElementById("revealStatus");
  const ack = document.getElementById("ackRead");
  const btn = document.getElementById("closeModal");

  cont.innerHTML = "";
  ack.checked = false; ack.disabled = true;
  btn.disabled = true;

  const tmp = document.createElement("div");
  tmp.innerHTML = STIMULI[v];
  const raw = tmp.textContent.trim().replace(/\s+/g," ");
  // compatible sentence split (no lookbehind)
  const parts = raw.split(/([.!?])\s+/);
  const sentences = [];
  for (let i=0; i<parts.length; i+=2){
    const chunk = (parts[i]||"").trim();
    const punct = (parts[i+1]||"").trim();
    const s = (chunk + (punct?punct:"")).trim();
    if(s) sentences.push(s);
  }

  sentences.forEach(s=>{
    const p = document.createElement("p");
    p.className = "fade";
    p.textContent = s;
    cont.appendChild(p);
  });
  const spacer = document.createElement("p");
  spacer.style.marginTop = "400px";
  cont.appendChild(spacer);

  state.stimulus.openAt = Date.now();
  state.stimulus.canCloseAt = state.stimulus.openAt + cfg.minReadMs;

  const nodes = [...cont.querySelectorAll(".fade")];
  let i = 0;
  status.textContent = `Showing 0 / ${nodes.length} sentences…`;

  const timer = setInterval(()=>{
    if(i < nodes.length){
      nodes[i].classList.add("show");
      i++;
      status.textContent = `Showing ${i} / ${nodes.length} sentences…`;
      if(i === nodes.length){
        clearInterval(timer);
        state.stimulus.allShownAt = Date.now();
        status.textContent = `All sentences shown. You may check the box and continue once the minimum reading time has passed.`;
        maybeEnable();
      }
    }
  }, Math.max(400, cfg.sentenceIntervalMs));

  let scrolledBottom = !cfg.requireScrollToBottom;
  document.querySelector(".modal-content").addEventListener("scroll", (e)=>{
    const el = e.currentTarget;
    if(el.scrollTop + el.clientHeight >= el.scrollHeight - 8){
      scrolledBottom = true;
      maybeEnable();
    }
  });
  ack.addEventListener("change", maybeEnable);

  function maybeEnable(){
    const timeOK = Date.now() >= state.stimulus.canCloseAt;
    const allShown = !!state.stimulus.allShownAt;
    ack.disabled = !(timeOK && allShown);
    btn.disabled = !(ack.checked && scrolledBottom && timeOK && allShown);
  }

  btn.addEventListener("click", ()=>{
    state.stimulus.closedAt = new Date();
    document.getElementById("modal").style.display = "none";
    document.getElementById("stageChoice").hidden = false;
    state.choice.startAt = Date.now();
  });
}

// ========= Items (no price on card) =========
async function loadItems(){
  const res = await fetch("data/items.json");
  const items = await res.json();
  const grid = document.getElementById("grid");
  items.forEach(item=>{
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <img src="${item.image}" alt="${item.label}">
      <div class="title">${item.label}</div>
      <button class="btn select" data-id="${item.id}" data-label="${item.label}">Select</button>
    `;
    grid.appendChild(card);
  });

  grid.addEventListener("click",(e)=>{
    const b = e.target.closest(".select");
    if(!b) return;
    const id = b.dataset.id, label = b.dataset.label;
    const first = !state.choice.id;
    state.choice.id = id;
    state.choice.label = label;
    document.getElementById("cartItem").textContent = label;
    document.getElementById("toSurvey").disabled = false;
    if(first){
      state.choice.clickAt = new Date();
      state.choice.rt_ms = Date.now() - (state.choice.startAt || Date.now());
    }
  });

  document.getElementById("toSurvey").addEventListener("click", ()=>{
    document.getElementById("stageChoice").hidden = true;
    document.getElementById("stageSurvey").hidden = false;
    state.survey.startAt = Date.now();
  });
}

// ========= Build Questions =========
function buildQuestions(){
  const box = document.getElementById("questions");
  const qs = [
    { id:"q1", title:"In any community I might live in: It would be more important for me to", a:"Get from the community", b:"Give to the community" },
    { id:"q2", title:"In any community I might live in: It would be more important for me to", a:"Help others", b:"Watch out for my own good" },
    { id:"q3", title:"In any community I might live in: I would be more concerned about", a:"What I received from the community", b:"What I contributed to the community" },
    { id:"q4", title:"In any community I might live in: The hard work I would do should", a:"Benefit the community", b:"Benefit me" },
    { id:"q5", title:"In any community I might live in: My personal philosophy in dealing with the community would be", a:"If I don’t look out for myself, nobody else will", b:"It’s better for me to give than to receive" }
  ];
  qs.forEach((q, idx)=>{
    const el = document.createElement("div");
    el.className = "q";
    el.innerHTML = `
      <h4>${idx+1}. ${q.title}</h4>
      <div class="row">
        <label>${q.a}:
          <input type="number" min="0" max="10" step="1" value="0" data-q="${q.id}" data-side="a">
        </label>
        <label>${q.b}:
          <input type="number" min="0" max="10" step="1" value="0" data-q="${q.id}" data-side="b">
        </label>
        <span class="sum" id="${q.id}_sum">Total: 0 / 10</span>
      </div>
    `;
    box.appendChild(el);
  });

  box.addEventListener("input",(e)=>{
    const input = e.target;
    if(input.tagName!=="INPUT") return;
    let v = parseInt(input.value||"0",10);
    if(isNaN(v)||v<0) v=0; if(v>10) v=10;
    input.value = v;
    updateSums();
  });

  document.getElementById("surveyForm").addEventListener("submit", onSubmit);
  updateSums();
}

function updateSums(){
  let ok = true;
  ["q1","q2","q3","q4","q5"].forEach(id=>{
    const a = parseInt(document.querySelector(`input[data-q="${id}"][data-side="a"]`).value,10)||0;
    const b = parseInt(document.querySelector(`input[data-q="${id}"][data-side="b"]`).value,10)||0;
    const sum = a+b;
    document.querySelector(`#${id}_sum`).textContent = `Total: ${sum} / 10`;
    if(sum!==10) ok=false;
  });
  document.getElementById("submitBtn").disabled = !ok;
}

// ========= Submit =========
async function onSubmit(e){
  e.preventDefault();
  const answers = {};
  ["q1","q2","q3","q4","q5"].forEach(id=>{
    const a = parseInt(document.querySelector(`input[data-q="${id}"][data-side="a"]`).value,10)||0;
    const b = parseInt(document.querySelector(`input[data-q="${id}"][data-side="b"]`).value,10)||0;
    answers[`${id}_a`] = a;
    answers[`${id}_b`] = b;
  });

  const payload = {
    participant_id: state.participant_id,
    session_id: state.session_id,
    page_version: state.page_version,
    tz_offset_min: state.tz_offset_min,
    ua_hash: state.ua_hash,
    stimulus_version: state.stimulus.version,
    stimulus_read_time_ms: (state.stimulus.closedAt?.getTime?.()||Date.now()) - state.stimulus.openAt,
    stimulus_closed_at: new Date(state.stimulus.closedAt || Date.now()).toISOString(),
    choice_item_id: state.choice.id,
    choice_item_label: state.choice.label,
    choice_click_at: state.choice.clickAt?.toISOString?.() || nowISO(),
    choice_rt_ms: state.choice.rt_ms || 0,
    ...answers,
    nonfood_chosen: NONFOOD_SET.has(state.choice.id),
    item_category: NONFOOD_SET.has(state.choice.id) ? "nonfood" : "food",
    completion_at: nowISO(),
    total_time_ms: Date.now() - state.appStart
  };

  await sendToSink(payload);
  document.getElementById("stageSurvey").hidden = true;
  document.getElementById("stageDone").hidden = false;
}

async function sendToSink(payload){
  try{
    const r = await fetch(cfg.webhookURL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // simple request, no preflight
      body: JSON.stringify(payload),
      mode: "cors"
    });
    if(!r.ok) throw new Error("Webhook failed: " + r.status);
  }catch(err){
    console.error(err);
    alert("Failed to submit. Please try again.");
  }
}
