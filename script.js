const currentEl = document.getElementById("current");
const historyEl = document.getElementById("history");
const keysEl = document.querySelector(".keys");

const SYMBOLS = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const MAX_DIGITS = 15;

let tokens = [];             // finished part of the expression, e.g. ["3", "+", "4", "-"]
let current = "0";           // number being typed, or the last result
let awaitingOperand = false; // true right after an operator is pressed
let justEvaluated = false;   // true right after "="
let hasError = false;
let lastExpression = "";     // expression shown after "=" (or after an error)

/* ---------- Math ---------- */

function compute(a, b, op) {
  const x = parseFloat(a);
  const y = parseFloat(b);
  let result;

  switch (op) {
    case "+": result = x + y; break;
    case "-": result = x - y; break;
    case "*": result = x * y; break;
    case "/":
      if (y === 0) return null; // division by zero
      result = x / y;
      break;
    default: return b;
  }

  if (!Number.isFinite(result)) return null;

  // Trim floating point noise (0.1 + 0.2 -> 0.3)
  return parseFloat(result.toPrecision(12)).toString();
}

// Evaluates a flat list like ["3", "+", "4", "*", "2"] with the usual
// order of operations (× and ÷ first, then + and −). No eval() involved.
function evaluateTokens(list) {
  // Pass 1: resolve × and ÷
  const reduced = [list[0]];
  for (let i = 1; i < list.length; i += 2) {
    const op = list[i];
    const next = list[i + 1];

    if (op === "*" || op === "/") {
      const left = reduced.pop();
      const result = compute(left, next, op);
      if (result === null) return null;
      reduced.push(result);
    } else {
      reduced.push(op, next);
    }
  }

  // Pass 2: resolve + and −, left to right
  let total = reduced[0];
  for (let i = 1; i < reduced.length; i += 2) {
    total = compute(total, reduced[i + 1], reduced[i]);
    if (total === null) return null;
  }
  return total;
}

/* ---------- Display ---------- */

function format(value) {
  if (value === "Error") return value;
  const [intPart, decPart] = value.split(".");
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;

  // Leave exponent notation (e.g. 1e+21) untouched
  if (!/^\d+$/.test(digits)) return value;

  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return (negative ? "-" : "") + grouped + (decPart !== undefined ? "." + decPart : "");
}

function describe(list) {
  return list.map((t) => (SYMBOLS[t] !== undefined ? SYMBOLS[t] : format(t))).join(" ");
}

function expressionText() {
  if (justEvaluated || hasError) return lastExpression;
  if (tokens.length === 0) return "";

  const parts = tokens.map((t) => (SYMBOLS[t] !== undefined ? SYMBOLS[t] : format(t)));
  if (!awaitingOperand) parts.push(format(current)); // number currently being typed
  return parts.join(" ");
}

function updateDisplay() {
  const text = format(current);
  currentEl.textContent = text;

  // Shrink long numbers so they fit
  currentEl.classList.toggle("small", text.length > 11 && text.length <= 16);
  currentEl.classList.toggle("smaller", text.length > 16);

  historyEl.textContent = expressionText();
  historyEl.scrollTop = historyEl.scrollHeight; // keep the latest part visible
}

function showError(expression) {
  lastExpression = expression;
  current = "Error";
  tokens = [];
  awaitingOperand = false;
  justEvaluated = false;
  hasError = true;
  updateDisplay();
}

/* ---------- Actions ---------- */

function clearAll() {
  tokens = [];
  current = "0";
  awaitingOperand = false;
  justEvaluated = false;
  hasError = false;
  lastExpression = "";
  updateDisplay();
}

function startFresh() {
  tokens = [];
  lastExpression = "";
  justEvaluated = false;
}

function inputDigit(digit) {
  if (hasError) clearAll();

  if (awaitingOperand) {
    current = digit;
    awaitingOperand = false;
  } else if (justEvaluated) {
    startFresh();
    current = digit;
  } else if (current === "0") {
    current = digit;
  } else if (current.replace(/[-.]/g, "").length < MAX_DIGITS) {
    current += digit;
  }
  updateDisplay();
}

function inputDecimal() {
  if (hasError) clearAll();

  if (awaitingOperand) {
    current = "0.";
    awaitingOperand = false;
  } else if (justEvaluated) {
    startFresh();
    current = "0.";
  } else if (!current.includes(".")) {
    current += ".";
  }
  updateDisplay();
}

function chooseOperator(op) {
  if (hasError) return;

  if (justEvaluated) {
    // Keep going from the previous result
    tokens = [current];
    lastExpression = "";
    justEvaluated = false;
  } else if (awaitingOperand) {
    // Two operators in a row: replace the last one
    tokens[tokens.length - 1] = op;
    updateDisplay();
    return;
  } else {
    tokens.push(current);
  }

  tokens.push(op);
  awaitingOperand = true;
  updateDisplay();
}

function evaluate() {
  if (hasError || justEvaluated || tokens.length === 0 || awaitingOperand) return;

  const full = [...tokens, current];
  const expression = `${describe(full)} =`;
  const result = evaluateTokens(full);

  if (result === null) return showError(expression);

  lastExpression = expression;
  current = result;
  tokens = [];
  justEvaluated = true;
  updateDisplay();
}

function deleteLast() {
  if (hasError || justEvaluated) return;

  if (awaitingOperand) {
    // Undo the operator and go back to editing the previous number
    tokens.pop();
    current = tokens.pop() ?? "0";
    awaitingOperand = false;
  } else {
    current = current.slice(0, -1);
    if (current === "" || current === "-") current = "0";
  }
  updateDisplay();
}

function percent() {
  if (hasError || awaitingOperand) return;

  if (justEvaluated) startFresh();
  current = parseFloat((parseFloat(current) / 100).toPrecision(12)).toString();
  updateDisplay();
}

/* ---------- Click handling ---------- */

keysEl.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.digit !== undefined) return inputDigit(button.dataset.digit);
  if (button.dataset.operator) return chooseOperator(button.dataset.operator);

  switch (button.dataset.action) {
    case "clear": return clearAll();
    case "delete": return deleteLast();
    case "decimal": return inputDecimal();
    case "percent": return percent();
    case "equals": return evaluate();
  }
});

/* ---------- Keyboard support ---------- */

function flash(selector) {
  const button = document.querySelector(selector);
  if (!button) return;
  button.classList.add("pressed");
  setTimeout(() => button.classList.remove("pressed"), 120);
}

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key;

  if (/^[0-9]$/.test(key)) {
    event.preventDefault();
    flash(`[data-digit="${key}"]`);
    inputDigit(key);
  } else if (key === "." || key === ",") {
    event.preventDefault();
    flash('[data-action="decimal"]');
    inputDecimal();
  } else if (["+", "-", "*", "/"].includes(key)) {
    event.preventDefault();
    flash(`[data-operator="${key}"]`);
    chooseOperator(key);
  } else if (key === "Enter" || key === "=") {
    event.preventDefault();
    flash('[data-action="equals"]');
    evaluate();
  } else if (key === "Backspace") {
    event.preventDefault();
    flash('[data-action="delete"]');
    deleteLast();
  } else if (key === "Escape" || key.toLowerCase() === "c") {
    event.preventDefault();
    flash('[data-action="clear"]');
    clearAll();
  } else if (key === "%") {
    event.preventDefault();
    flash('[data-action="percent"]');
    percent();
  }
});

updateDisplay();
