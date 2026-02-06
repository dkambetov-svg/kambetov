// app.js (ES module version using transformers.js for local sentiment classification)

import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.6/dist/transformers.min.js";

// Global variables
let reviews = [];
let apiToken = "";
let sentimentPipeline = null;
let currentReview = ""; // For current review

// DOM elements
const analyzeBtn = document.getElementById("analyze-btn");
const reviewText = document.getElementById("review-text");
const sentimentResult = document.getElementById("sentiment-result");
const loadingElement = document.querySelector(".loading");
const errorElement = document.getElementById("error-message");
const apiTokenInput = document.getElementById("api-token");
const statusElement = document.getElementById("status");

// Google Apps Script URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyk410E3qkdF3cL6VnfFFen4jYpHFX38OnRzOZOAW2NDrur0joyaNz2ft2jil7bDftj0g/exec";

// Initialize the app
document.addEventListener("DOMContentLoaded", function () {
  loadReviews();
  analyzeBtn.addEventListener("click", analyzeRandomReview);
  apiTokenInput.addEventListener("change", saveApiToken);
  
  const savedToken = localStorage.getItem("hfApiToken");
  if (savedToken) {
    apiTokenInput.value = savedToken;
    apiToken = savedToken;
  }
  
  initSentimentModel();
});

// Initialize transformers.js sentiment model
async function initSentimentModel() {
  try {
    if (statusElement) {
      statusElement.textContent = "Loading sentiment model...";
    }
    
    sentimentPipeline = await pipeline(
      "text-classification",
      "Xenova/distilbert-base-uncased-finetuned-sst-2-english"
    );
    
    if (statusElement) {
      statusElement.textContent = "Sentiment model ready";
    }
  } catch (error) {
    console.error("Failed to load sentiment model:", error);
    showError(
      "Failed to load sentiment model. Please check your network connection and try again."
    );
    if (statusElement) {
      statusElement.textContent = "Model load failed";
    }
  }
}

// Load and parse the TSV file using Papa Parse
function loadReviews() {
  fetch("reviews_test.tsv")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Failed to load TSV file");
      }
      return response.text();
    })
    .then((tsvData) => {
      Papa.parse(tsvData, {
        header: true,
        delimiter: "\t",
        complete: (results) => {
          reviews = results.data
            .map((row) => row.text)
            .filter((text) => typeof text === "string" && text.trim() !== "");
          console.log("Loaded", reviews.length, "reviews");
        },
        error: (error) => {
          console.error("TSV parse error:", error);
          showError("Failed to parse TSV file: " + error.message);
        },
      });
    })
    .catch((error) => {
      console.error("TSV load error:", error);
      showError("Failed to load TSV file: " + error.message);
    });
}

// Save API token to localStorage
function saveApiToken() {
  apiToken = apiTokenInput.value.trim();
  if (apiToken) {
    localStorage.setItem("hfApiToken", apiToken);
  } else {
    localStorage.removeItem("hfApiToken");
  }
}

// Analyze a random review
function analyzeRandomReview() {
  hideError();

  if (!Array.isArray(reviews) || reviews.length === 0) {
    showError("No reviews available. Please try again later.");
    return;
  }

  if (!sentimentPipeline) {
    showError("Sentiment model is not ready yet. Please wait a moment.");
    return;
  }

  const selectedReview = reviews[Math.floor(Math.random() * reviews.length)];
  currentReview = selectedReview; // Save current review

  // Display the review
  reviewText.textContent = selectedReview;

  // Show loading state
  loadingElement.style.display = "block";
  analyzeBtn.disabled = true;
  sentimentResult.innerHTML = "";
  sentimentResult.className = "sentiment-result";

  // Call local sentiment model
  analyzeSentiment(selectedReview)
    .then((result) => {
      displaySentiment(result);
      return result;
    })
    .then((result) => {
      // Logging data to Google Sheets
      logToGoogleSheets(selectedReview, result);
    })
    .catch((error) => {
      console.error("Error:", error);
      showError(error.message || "Failed to analyze sentiment.");
    })
    .finally(() => {
      loadingElement.style.display = "none";
      analyzeBtn.disabled = false;
    });
}

// Call local transformers.js pipeline for sentiment classification
async function analyzeSentiment(text) {
  if (!sentimentPipeline) {
    throw new Error("Sentiment model is not initialized.");
  }

  const output = await sentimentPipeline(text);

  if (!Array.isArray(output) || output.length === 0) {
    throw new Error("Invalid sentiment output from local model.");
  }

  return [output];
}

// Display sentiment result
function displaySentiment(result) {
  let sentiment = "neutral";
  let score = 0.5;
  let label = "NEUTRAL";

  if (
    Array.isArray(result) &&
    result.length > 0 &&
    Array.isArray(result[0]) &&
    result[0].length > 0
  ) {
    const sentimentData = result[0][0];

    if (sentimentData && typeof sentimentData === "object") {
      label =
        typeof sentimentData.label === "string"
          ? sentimentData.label.toUpperCase()
          : "NEUTRAL";
      score =
        typeof sentimentData.score === "number"
          ? sentimentData.score
          : 0.5;

      if (label === "POSITIVE" && score > 0.5) {
        sentiment = "positive";
      } else if (label === "NEGATIVE" && score > 0.5) {
        sentiment = "negative";
      } else {
        sentiment = "neutral";
      }
    }
  }

  // Update UI
  sentimentResult.classList.add(sentiment);
  sentimentResult.innerHTML = `
        <i class="fas ${getSentimentIcon(sentiment)} icon"></i>
        <span>${label} (${(score * 100).toFixed(1)}% confidence)</span>
    `;
  
  return { sentiment: label, confidence: score, sentimentBucket: sentiment };
}

// Logging data to Google Sheets
async function logToGoogleSheets(review, sentimentResult) {
  try {
    // Extracte data from analysis result
    const sentimentData = sentimentResult[0][0];
    const label = sentimentData.label.toUpperCase();
    const score = sentimentData.score;
    const confidence = (score * 100).toFixed(1) + '%';
    
    // Extracte meta-information
    const meta = {
      model: "Xenova/distilbert-base-uncased-finetuned-sst-2-english",
      inference_type: "local_transformers_js",
      timestamp: new Date().toISOString(),
      review_length: review.length,
      review_preview: review.substring(0, 100) + (review.length > 100 ? "..." : ""),
      client_info: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        platform: navigator.platform,
        screen_resolution: `${window.screen.width}x${window.screen.height}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };

    // Prepare data to sending
    const data = {
      ts_iso: new Date().toISOString(),
      review: review,
      sentiment: `${label} (${confidence})`,
      meta: JSON.stringify(meta)
    };

    // Send data to Google Apps Script
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors", // Важно для Google Apps Script
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    console.log("Data logged to Google Sheets:", data);

  } catch (error) {
    console.error("Error logging to Google Sheets:", error);
    // Don't show errors to user
  }
}

// Get appropriate icon for sentiment bucket
function getSentimentIcon(sentiment) {
  switch (sentiment) {
    case "positive":
      return "fa-thumbs-up";
    case "negative":
      return "fa-thumbs-down";
    default:
      return "fa-question-circle";
  }
}

// Show error message
function showError(message) {
  errorElement.textContent = message;
  errorElement.style.display = "block";
}

// Hide error message
function hideError() {
  errorElement.style.display = "none";
}
