/* =======================
   CONFIG
======================= */

const HF_MODEL_URL =
  "https://api-inference.huggingface.co/models/siebert/sentiment-roberta-large-english";

const GAS_URL =
  "https://script.google.com/macros/s/AKfycbwNIS9yrSOW8RJttfv-3WZnbduktNa1qAH64gO5ouJM3GUVsiLIzkUcaqZGyBN5yJsu/exec";

/* =======================
   GLOBAL STATE
======================= */

let reviews = [];

/* =======================
   DOM ELEMENTS
======================= */

const analyzeBtn = document.getElementById("analyze-btn");
const reviewText = document.getElementById("review-text");
const sentimentResult = document.getElementById("sentiment-result");
const loadingElement = document.querySelector(".loading");
const errorElement = document.getElementById("error-message");
const apiTokenInput = document.getElementById("api-token");

/* =======================
   INIT
======================= */

document.addEventListener("DOMContentLoaded", () => {
  loadReviews();
  analyzeBtn.addEventListener("click", analyzeRandomReview);

  const savedToken = localStorage.getItem("hfApiToken");
  if (savedToken) apiTokenInput.value = savedToken;
});

/* =======================
   LOAD REVIEWS
======================= */

function loadReviews() {
  fetch("reviews_test.tsv")
    .then((r) => r.arrayBuffer())
    .then((buf) => {
      const text = new TextDecoder("latin1").decode(buf);

      Papa.parse(text, {
        header: true,
        delimiter: "\t",
        skipEmptyLines: true,
        complete: (res) => {
          reviews = res.data
            .map((row) => row.text)
            .filter((v) => typeof v === "string" && v.length > 20);

          console.log("REVIEWS COUNT:", reviews.length);
        },
      });
    })
    .catch(() => showError("Failed to load reviews"));
}

/* =======================
   MAIN FLOW
======================= */

async function analyzeRandomReview() {
  hideError();

  const token = apiTokenInput.value.trim();
  if (!token) {
    showError("Please enter Hugging Face API token");
    return;
  }

  if (!reviews.length) {
    showError("Reviews not loaded yet");
    return;
  }

  const review = reviews[Math.floor(Math.random() * reviews.length)];
  reviewText.textContent = review;

  loadingElement.style.display = "block";
  analyzeBtn.disabled = true;
  sentimentResult.innerHTML = "";

  try {
    const result = await analyzeSentiment(review, token);
    displaySentiment(result, review);
  } catch (e) {
    console.error(e);
    showError("Sentiment analysis failed");
  } finally {
    loadingElement.style.display = "none";
    analyzeBtn.disabled = false;
  }
}

/* =======================
   HF INFERENCE API
======================= */

async function analyzeSentiment(text, token) {
  const res = await fetch(HF_MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: text }),
  });

  const data = await res.json();

  if (!Array.isArray(data) || !data[0]) {
    throw new Error("Invalid HF response");
  }

  return data[0];
}

/* =======================
   DISPLAY + LOGGING
======================= */

function displaySentiment(result, review) {
  const { label, score } = result;

  const finalLabel = label.toUpperCase();
  const finalScore = score;

  let sentimentClass = "neutral";
  if (finalLabel === "POSITIVE") sentimentClass = "positive";
  if (finalLabel === "NEGATIVE") sentimentClass = "negative";

  sentimentResult.className = `sentiment-result ${sentimentClass}`;
  sentimentResult.innerHTML = `
    <span>${finalLabel} (${(finalScore * 100).toFixed(1)}%)</span>
  `;

  logToGoogleSheet({
    review,
    label: finalLabel,
    score: finalScore,
  });
}

/* =======================
   GOOGLE SHEETS LOGGING
======================= */

async function logToGoogleSheet({ review, label, score }) {
  const body = new URLSearchParams();
  body.set("ts", Date.now());
  body.set("review", review);
  body.set("sentiment", `${label} (${(score * 100).toFixed(1)}%)`);
  body.set(
    "meta",
    JSON.stringify({
      ua: navigator.userAgent,
      page: location.href,
      model: "siebert/sentiment-roberta-large-english",
    })
  );

  await fetch(GAS_URL, {
    method: "POST",
    body,
  });
}

/* =======================
   HELPERS
======================= */

function showError(msg) {
  errorElement.textContent = msg;
  errorElement.style.display = "block";
}

function hideError() {
  errorElement.style.display = "none";
}
