const $ = (id) => document.getElementById(id);

const imageInput = $("imageInput");
const preview = $("preview");
const scanBtn = $("scanBtn");
const scanStatus = $("scanStatus");
const ocrText = $("ocrText");
const STORAGE_KEY = "question-detector-bank-v1";

let selectedImage = null;
let bank = loadBank();

function loadBank() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function saveBank() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bank));
  renderBank();
}

function normalize(text) {
  return text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();
}

function similarity(first, second) {
  const a = new Set(normalize(first).split(" ").filter(Boolean));
  const b = new Set(normalize(second).split(" ").filter(Boolean));
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const word of a) if (b.has(word)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    scanStatus.textContent = "Please choose an image file.";
    return;
  }
  selectedImage = file;
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
  scanBtn.disabled = false;
  scanStatus.textContent = "Screenshot ready to scan.";
});

scanBtn.addEventListener("click", async () => {
  if (!selectedImage) return;
  if (!window.Tesseract) {
    scanStatus.textContent = "OCR library unavailable. Check your internet connection.";
    return;
  }
  scanBtn.disabled = true;
  scanStatus.textContent = "Reading screenshot...";
  try {
    const result = await Tesseract.recognize(selectedImage, "eng", {
      logger: (message) => {
        if (message.status === "recognizing text") {
          scanStatus.textContent = `Recognizing text: ${Math.round(message.progress * 100)}%`;
        }
      }
    });
    ocrText.value = result.data.text.trim();
    if (!ocrText.value) {
      scanStatus.textContent = "No readable text found. Try a clearer screenshot.";
    } else {
      scanStatus.textContent = "Scan complete. Check and correct the extracted text.";
      parseOcrText();
    }
  } catch (error) {
    console.error(error);
    scanStatus.textContent = "Could not scan image. Try another screenshot.";
  } finally {
    scanBtn.disabled = false;
  }
});

function parseOcrText() {
  const lines = ocrText.value.split("\n").map(line => line.trim()).filter(Boolean);
  if (!lines.length) return;
  $("question").value = lines[0];
  $("choices").value = lines.slice(1).join("\n");
}

$("parseBtn").addEventListener("click", parseOcrText);

function findMatches(question) {
  return bank.map(item => ({ ...item, score: similarity(question, item.question) }))
    .filter(item => item.score >= 0.25)
    .sort((a, b) => b.score - a.score);
}

$("findBtn").addEventListener("click", () => {
  const question = $("question").value.trim();
  const choices = $("choices").value.split("\n").map(x => x.trim()).filter(Boolean);
  const results = $("results");

  if (!question) {
    results.textContent = "Enter a question first.";
    return;
  }
  if (!bank.length) {
    results.textContent = "Your question bank is empty. Add verified question-and-answer pairs below.";
    return;
  }

  const matches = findMatches(question);
  if (!matches.length) {
    results.textContent = "No close match found in your saved question bank.";
    return;
  }

  results.replaceChildren();
  matches.slice(0, 5).forEach((match, index) => {
    const card = document.createElement("div");
    card.className = "bank-item";

    const heading = document.createElement("strong");
    heading.textContent = index === 0 ? "Best database match" : "Other matching question";

    const matchedQuestion = document.createElement("p");
    matchedQuestion.textContent = match.question;

    const answer = document.createElement("div");
    answer.className = "result-answer";
    answer.textContent = match.answer;

    const confidence = document.createElement("div");
    confidence.className = "result-meta";
    confidence.textContent = `Text similarity: ${Math.round(match.score * 100)}%`;

    const choiceMatch = choices.some(choice => normalize(choice) === normalize(match.answer));
    const choiceStatus = document.createElement("div");
    choiceStatus.className = "result-meta";
    choiceStatus.textContent = choices.length
      ? (choiceMatch ? "Saved answer appears among the choices." : "Saved answer was not found exactly among the choices.")
      : "No answer choices were entered.";

    card.append(heading, matchedQuestion, answer, confidence, choiceStatus);
    results.append(card);
  });

  const note = document.createElement("p");
  note.className = "result-meta";
  note.textContent = "Suggestions come only from your saved database. Similarity is not proof that an answer is correct.";
  results.append(note);
});

$("saveBtn").addEventListener("click", () => {
  const question = $("newQuestion").value.trim();
  const answer = $("correctAnswer").value.trim();
  if (!question || !answer) {
    alert("Enter both a question and its verified answer.");
    return;
  }
  if (bank.some(item => normalize(item.question) === normalize(question))) {
    alert("That question is already saved.");
    return;
  }
  bank.push({ id: Date.now(), question, answer });
  saveBank();
  $("newQuestion").value = "";
  $("correctAnswer").value = "";
});

function renderBank() {
  const list = $("bankList");
  list.replaceChildren();
  $("bankCount").textContent = bank.length;

  if (!bank.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No saved questions yet.";
    list.append(empty);
    return;
  }

  bank.forEach(item => {
    const card = document.createElement("div");
    card.className = "bank-item";
    const question = document.createElement("strong");
    question.textContent = item.question;
    const answer = document.createElement("p");
    answer.textContent = `Answer: ${item.answer}`;
    const remove = document.createElement("button");
    remove.className = "danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => {
      bank = bank.filter(entry => entry.id !== item.id);
      saveBank();
    });
    card.append(question, answer, remove);
    list.append(card);
  });
}

$("clearBtn").addEventListener("click", () => {
  if (!confirm("Delete every saved question?")) return;
  bank = [];
  saveBank();
});

renderBank();
