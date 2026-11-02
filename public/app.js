const $ = (id) => document.getElementById(id);
const form = $("form");
const files = []; // { file, url }
let config = { transcription: false };

fetch("/api/config")
  .then((r) => r.json())
  .then((c) => {
    config = c;
    renderFiles();
  })
  .catch(() => {});

/* ---------- file drop ---------- */
const drop = $("drop");
const fileInput = $("fileInput");

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener("change", () => {
  addFiles(fileInput.files);
  fileInput.value = "";
});
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  }),
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("over");
  }),
);
drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
document.addEventListener("paste", (e) => {
  const pasted = [...(e.clipboardData?.files ?? [])];
  if (pasted.length) addFiles(pasted);
});

function addFiles(list) {
  for (const file of list) {
    if (!/^(image|audio|video)\//.test(file.type)) continue;
    if (files.length >= 12) break;
    files.push({ file, url: URL.createObjectURL(file) });
  }
  renderFiles();
}

function renderFiles() {
  const ul = $("fileList");
  ul.innerHTML = "";
  files.forEach(({ file, url }, i) => {
    const li = document.createElement("li");
    li.className = "file";
    if (file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = url;
      img.alt = file.name;
      li.append(img);
    } else {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.src = url;
      li.append(audio);
    }
    const name = document.createElement("span");
    name.className = "fname";
    name.textContent = file.name;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "rm";
    rm.setAttribute("aria-label", `Remove ${file.name}`);
    rm.textContent = "✕";
    rm.onclick = () => {
      URL.revokeObjectURL(url);
      files.splice(i, 1);
      renderFiles();
    };
    li.append(name, rm);
    ul.append(li);
  });
  const hasAudio = files.some(({ file }) => !file.type.startsWith("image/"));
  $("audioWarn").hidden = !(hasAudio && !config.transcription);
}

/* ---------- live recording ---------- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const recBtn = $("recBtn");
const transcriptEl = $("liveTranscript");
let recorder = null;
let recognition = null;
let chunks = [];
let timerId = null;
let startedAt = 0;
let finalText = "";

recBtn.addEventListener("click", () => (recorder ? stopRecording() : startRecording()));

async function startRecording() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    $("recStatus").textContent = "Microphone permission denied.";
    return;
  }

  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    const type = recorder.mimeType || "audio/webm";
    const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const file = new File(chunks, `live-recording-${stamp.replace(":", "")}.${ext}`, { type });
    // The live transcript already covers it when the server can't transcribe audio.
    if (config.transcription || !SpeechRecognition) addFiles([file]);
    recorder = null;
  };
  recorder.start(1000);

  finalText = transcriptEl.value ? transcriptEl.value.trimEnd() + "\n" : "";
  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = form.language.value === "id" ? "id-ID" : "en-US";
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript.trim() + "\n";
        else interim += r[0].transcript;
      }
      transcriptEl.value = finalText + interim;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    };
    // Browsers end recognition after silence; keep it going while recording.
    recognition.onend = () => recorder && recognition && recognition.start();
    recognition.start();
  } else {
    $("speechWarn").hidden = false;
  }

  startedAt = Date.now();
  $("recTimer").hidden = false;
  timerId = setInterval(tick, 500);
  tick();
  recBtn.textContent = "■ Stop recording";
  recBtn.classList.add("live");
  $("recStatus").textContent = "Recording…";
}

function stopRecording() {
  if (recognition) {
    const r = recognition;
    recognition = null;
    r.stop();
  }
  recorder?.stop();
  clearInterval(timerId);
  recBtn.textContent = "● Start recording";
  recBtn.classList.remove("live");
  $("recStatus").textContent = "Saved.";
}

function tick() {
  const s = Math.floor((Date.now() - startedAt) / 1000);
  $("recTimer").textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- submit ---------- */
const loadingLines = [
  "Reviewing the evidence…",
  "Reading between the lines of her texts…",
  "Checking who said what, and when…",
  "Preparing your rebuttals…",
  "Deciding whether you should apologise…",
];

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (recorder) stopRecording();
  await new Promise((r) => setTimeout(r, 300)); // let the recorder flush

  const fd = new FormData(form);
  files.forEach(({ file }) => fd.append("files", file, file.name));

  $("error").hidden = true;
  $("submitBtn").disabled = true;
  $("loading").hidden = false;
  $("results").hidden = true;
  let li = 0;
  $("loadingMsg").textContent = loadingLines[0];
  const rot = setInterval(() => ($("loadingMsg").textContent = loadingLines[++li % loadingLines.length]), 3500);

  try {
    const res = await fetch("/api/analyze", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Something went wrong");
    renderResults(data);
  } catch (err) {
    $("error").textContent = err.message;
    $("error").hidden = false;
  } finally {
    clearInterval(rot);
    $("loading").hidden = true;
    $("submitBtn").disabled = false;
  }
});

/* ---------- results ---------- */
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function section(title, ...children) {
  const s = el("section", "card");
  s.append(el("h3", null, title), ...children);
  return s;
}

function list(items, render) {
  const ul = el("ul", "list");
  items.forEach((it) => ul.append(render(it)));
  return ul;
}

const WINNER = {
  you: ["You win this one", "win"],
  her: ["She's got you here", "lose"],
  draw: ["It's a draw", "draw"],
  unclear: ["Too close to call", "draw"],
};

function renderResults(d) {
  const out = $("results");
  out.innerHTML = "";

  if (d.warnings?.length) {
    out.append(section("Notes", list(d.warnings, (w) => el("li", "muted", w))));
  }

  const v = d.verdict;
  const [label, cls] = WINNER[v.winner] ?? WINNER.unclear;
  const score = Math.max(0, Math.min(100, Math.round(v.yourScore)));
  const verdict = el("section", `card verdict ${cls}`);
  const meter = el("div", "meter");
  const fill = el("div", "fill");
  fill.style.width = `${score}%`;
  meter.append(fill);
  verdict.append(
    el("div", "kicker", label),
    el("h2", null, v.headline),
    el("div", "score", `Your case: ${score}/100`),
    meter,
    el("p", null, v.reasoning),
  );
  out.append(verdict);

  out.append(section("What this is really about", el("p", null, d.whatTheFightIsReallyAbout)));

  const sides = el("div", "two");
  sides.append(section("Your position", el("p", null, d.yourPosition)), section("Her position (steel-manned)", el("p", null, d.herPosition)));
  out.append(sides);

  out.append(
    section(
      "💪 Your strongest points",
      list(d.yourStrongestPoints, (p) => {
        const li = el("li");
        li.append(el("strong", null, p.point), el("div", "muted", p.evidence));
        return li;
      }),
    ),
  );

  out.append(
    section(
      "🛡️ What she'll say — and your answer",
      list(d.herLikelyComebacks, (c) => {
        const li = el("li", "qa");
        li.append(el("div", "q", `“${c.comeback}”`), el("div", "a", c.rebuttal));
        return li;
      }),
    ),
  );

  if (d.whereYouAreWrong?.length) {
    out.append(section("🙇 Concede these", list(d.whereYouAreWrong, (t) => el("li", null, t))));
  }
  if (d.landmines?.length) {
    out.append(section("💣 Do NOT say", list(d.landmines, (t) => el("li", "bad", t))));
  }

  const script = el("ol", "script");
  d.script.forEach((s) => script.append(el("li", null, s)));
  const game = section("🎯 Game plan", el("p", "opening", `Open with: “${d.openingLine}”`), script, el("p", "closing", d.closingMove));
  const copy = el("button", "btn ghost", "Copy script");
  copy.type = "button";
  copy.onclick = async () => {
    await navigator.clipboard.writeText([d.openingLine, ...d.script, d.closingMove].join("\n"));
    copy.textContent = "Copied ✓";
    setTimeout(() => (copy.textContent = "Copy script"), 1500);
  };
  game.append(copy);
  out.append(game);

  if (d.transcripts?.length) {
    const det = el("details", "card");
    det.append(el("summary", null, "Transcripts used"));
    d.transcripts.forEach((t) => det.append(el("h4", null, t.name), el("pre", null, t.text)));
    out.append(det);
  }

  out.hidden = false;
  out.scrollIntoView({ behavior: "smooth", block: "start" });
}
