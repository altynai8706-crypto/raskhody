"use strict";

(() => {
  const STORAGE_KEY = "family-expenses-v1";
  const BUDGET_STORAGE_KEY = "family-budgets-v1";
  const CATEGORIES = ["Еда", "Транспорт", "Дом", "Личные расходы", "Другое"];
  const $ = (id) => document.getElementById(id);
  const form = $("expense-form");
  const amount = $("amount");
  const category = $("category");
  const date = $("date");
  const comment = $("comment");
  const from = $("filter-from");
  const to = $("filter-to");
  const budgetForm = $("budget-form");
  const budgetTotals = [];
  const budgetInputs = CATEGORIES.map((name, index) => {
    const card = element("div", "budget-category");
    const label = element("label", "", `${name} — лимит, ₸`);
    const input = element("input");
    input.id = `budget-limit-${index}`;
    input.type = "text";
    input.inputMode = "decimal";
    input.autocomplete = "off";
    input.placeholder = "Не задан";
    input.setAttribute("aria-describedby", "budget-error");
    label.append(input);
    const totals = element("dl", "budget-totals");
    const spent = element("dd");
    const remaining = element("dd");
    totals.append(element("dt", "", "Потрачено"), spent, element("dt", "", "Осталось"), remaining);
    card.append(label, totals);
    $("budget-fields").append(card);
    budgetTotals.push({ spent, remaining });
    return input;
  });
  let budgets = {};
  let budgetMonth = "";
  let budgetsReadable = true;
  let expenses = [];
  let editingId = null;
  let storageReadable = true;
  let activePeriod = "all";
  let displayedDay = "";

  function localDate(value = new Date()) {
    return `${String(value.getFullYear()).padStart(4, "0")}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
    const parsed = new Date(`${value}T12:00:00`);
    return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value;
  }

  function parseMoney(value, allowZero = false) {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, fraction = ""] = normalized.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) && (allowZero ? cents >= 0 : cents > 0) ? cents : null;
  }

  function money(cents) {
    const absolute = Math.abs(cents);
    const whole = Math.floor(absolute / 100).toLocaleString("ru-RU");
    return `${cents < 0 ? "−" : ""}${whole}${absolute % 100 ? "," + String(absolute % 100).padStart(2, "0") : ""} ₸`;
  }

  function showMessage(id, message) {
    $(id).textContent = message;
    $(id).hidden = !message;
  }

  function validBudgets(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    return Object.entries(value).every(([month, limits]) => {
      if (!/^\d{4}-\d{2}$/.test(month) || !validDate(`${month}-01`) ||
          !limits || typeof limits !== "object" || Array.isArray(limits)) return false;
      let total = 0;
      return Object.entries(limits).every(([name, cents]) => {
        if (!CATEGORIES.includes(name) || !Number.isSafeInteger(cents) || cents < 0) return false;
        total += cents;
        return Number.isSafeInteger(total);
      });
    });
  }

  function loadBudgets() {
    try {
      const raw = localStorage.getItem(BUDGET_STORAGE_KEY);
      if (raw === null) return;
      const saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !validBudgets(saved.months)) throw new Error("Invalid budgets");
      budgets = saved.months;
    } catch {
      budgetsReadable = false;
      showMessage("budget-storage-error", "Не удалось прочитать лимиты. Их сохранение недоступно, чтобы не потерять прежние данные. Проверьте хранилище браузера и обновите страницу.");
    }
  }

  function refreshBudgetMonth() {
    const now = new Date();
    const month = localDate(now).slice(0, 7);
    if (month === budgetMonth) return false;
    const changed = budgetMonth !== "";
    budgetMonth = month;
    $("budget-month").textContent = now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    const limits = budgets[month] || {};
    budgetInputs.forEach((input, index) => {
      const cents = limits[CATEGORIES[index]];
      input.value = cents === undefined ? "" : money(cents).replace(/\s/g, "").replace("₸", "");
      input.removeAttribute("aria-invalid");
    });
    showMessage("budget-error", "");
    $("budget-status").textContent = changed ? "Начался новый месяц. Проверьте лимиты перед сохранением." : "";
    return changed;
  }

  function renderBudgetTotals() {
    const spentByCategory = Object.fromEntries(CATEGORIES.map((name) => [name, 0]));
    expenses.forEach((expense) => {
      if (expense.date.slice(0, 7) === budgetMonth) spentByCategory[expense.category] += expense.cents;
    });
    const limits = budgets[budgetMonth] || {};
    budgetTotals.forEach(({ spent, remaining }, index) => {
      const name = CATEGORIES[index];
      spent.textContent = money(spentByCategory[name]);
      remaining.textContent = limits[name] === undefined ? "Лимит не задан" : money(limits[name] - spentByCategory[name]);
    });
  }

  budgetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    // Не сохраняем ввод прошлого месяца, даже если таймер ещё не сработал.
    if (refreshBudgetMonth()) {
      renderBudgetTotals();
      return;
    }
    showMessage("budget-error", "");
    $("budget-status").textContent = "";
    budgetInputs.forEach((input) => input.removeAttribute("aria-invalid"));
    if (!budgetsReadable) {
      showMessage("budget-storage-error", "Сохранение лимитов недоступно: не удалось прочитать прежние данные. Обновите страницу после проверки хранилища браузера.");
      return;
    }
    const limits = {};
    let total = 0;
    for (let index = 0; index < budgetInputs.length; index++) {
      const input = budgetInputs[index];
      if (input.value.trim() === "") continue;
      const cents = parseMoney(input.value, true);
      if (cents === null || !Number.isSafeInteger(total + cents)) {
        showMessage("budget-error", cents === null ? "Введите лимит от нуля, не более двух знаков после запятой. Или оставьте поле пустым." : "Общий бюджет слишком велик для точного расчёта. Уменьшите лимиты.");
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      limits[CATEGORIES[index]] = cents;
      total += cents;
    }
    const next = { ...budgets, [budgetMonth]: limits };
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify({ version: 1, months: next }));
    } catch {
      showMessage("budget-storage-error", "Не удалось сохранить лимиты. Проверьте свободное место и разрешение на хранение данных. Изменения не применены; поля оставлены для повторной попытки.");
      return;
    }
    budgets = next;
    renderBudgetTotals();
    showMessage("budget-storage-error", "");
    $("budget-status").textContent = "Лимиты сохранены.";
  });

  function validRecords(records) {
    if (!Array.isArray(records)) return false;
    const ids = new Set();
    let total = 0;
    return records.every((record) => {
      if (!record || typeof record.id !== "string" || !record.id || ids.has(record.id) ||
          !Number.isSafeInteger(record.cents) || record.cents <= 0 ||
          !CATEGORIES.includes(record.category) || !validDate(record.date) ||
          typeof record.comment !== "string") return false;
      ids.add(record.id);
      total += record.cents;
      return Number.isSafeInteger(total);
    });
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const saved = JSON.parse(raw);
        if (!saved || saved.version !== 1 || !validRecords(saved.expenses)) throw new Error("Invalid data");
        expenses = saved.expenses;
      }
    } catch {
      storageReadable = false;
      showMessage("storage-error", "Не удалось прочитать сохранённые данные. Запись изменений недоступна, чтобы не потерять прежние расходы. Проверьте доступ к хранилищу браузера и обновите страницу.");
    }
  }

  function commit(next) {
    if (!storageReadable) {
      showMessage("storage-error", "Сохранение недоступно: не удалось прочитать прежние данные. Проверьте хранилище браузера и обновите страницу.");
      return false;
    }
    if (!validRecords(next)) {
      showMessage("storage-error", "Общая сумма слишком велика для точного расчёта. Уменьшите сумму.");
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, expenses: next }));
    } catch {
      showMessage("storage-error", "Не удалось сохранить изменения. Проверьте свободное место и разрешение на хранение данных. Изменения не применены; введённые поля сохранены в форме.");
      return false;
    }
    expenses = next;
    showMessage("storage-error", "");
    return true;
  }

  function resetForm() {
    editingId = null;
    form.reset();
    date.value = localDate();
    $("form-title").textContent = "Добавить трату";
    $("submit-button").textContent = "Добавить трату";
    $("cancel-edit").hidden = true;
    showMessage("form-error", "");
    form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  }

  function applyPeriod(period) {
    activePeriod = period;
    const now = new Date();
    to.value = period === "all" ? "" : localDate(now);
    if (period === "all") from.value = "";
    if (period === "day") from.value = localDate(now);
    if (period === "week") { now.setDate(now.getDate() - 6); from.value = localDate(now); }
    if (period === "month") { now.setDate(1); from.value = localDate(now); }
    render();
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function render() {
    refreshBudgetMonth();
    renderBudgetTotals();
    const now = new Date();
    displayedDay = localDate(now);
    const month = displayedDay.slice(0, 7);
    const current = expenses.filter((expense) => expense.date.slice(0, 7) === month);
    $("month-total").textContent = money(current.reduce((sum, expense) => sum + expense.cents, 0));
    $("month-count").textContent = current.length ? `Записей за месяц: ${current.length}` : "Расходов пока нет";
    $("month-label").textContent = now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    const invalidRange = from.value && to.value && from.value > to.value;
    showMessage("filter-error", invalidRange ? "Дата начала должна быть не позже даты окончания." : "");
    const visible = expenses.map((expense, index) => ({ ...expense, index }))
      .filter((expense) => !invalidRange && (!from.value || expense.date >= from.value) && (!to.value || expense.date <= to.value))
      .sort((a, b) => b.date.localeCompare(a.date) || b.index - a.index);
    $("list-count").textContent = String(visible.length);
    document.querySelectorAll("[data-period]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.period === activePeriod)));
    const list = $("expense-list");
    list.replaceChildren();
    visible.forEach((expense) => {
      const item = element("li", "expense-item");
      const heading = element("div", "expense-heading");
      const details = element("div");
      details.append(element("h3", "expense-category", expense.category));
      const time = element("time", "expense-date", expense.date.split("-").reverse().join("."));
      time.dateTime = expense.date;
      details.append(time);
      heading.append(details, element("span", "expense-amount", money(expense.cents)));
      item.append(heading);
      if (expense.comment) item.append(element("p", "expense-comment", expense.comment));
      const actions = element("div", "item-actions");
      const edit = element("button", "", "Изменить");
      edit.type = "button";
      edit.setAttribute("aria-label", `Изменить: ${expense.category}, ${money(expense.cents)}, ${time.textContent}`);
      edit.addEventListener("click", () => {
        resetForm();
        editingId = expense.id;
        amount.value = `${Math.floor(expense.cents / 100)}${expense.cents % 100 ? "," + String(expense.cents % 100).padStart(2, "0") : ""}`;
        category.value = expense.category;
        date.value = expense.date;
        comment.value = expense.comment;
        $("form-title").textContent = "Изменить трату";
        $("submit-button").textContent = "Сохранить";
        $("cancel-edit").hidden = false;
        amount.focus();
      });
      const remove = element("button", "delete", "Удалить");
      remove.type = "button";
      remove.setAttribute("aria-label", `Удалить: ${expense.category}, ${money(expense.cents)}, ${time.textContent}`);
      remove.addEventListener("click", () => {
        if (!window.confirm(`Удалить трату «${expense.category}» на ${money(expense.cents)} за ${time.textContent}?`)) return;
        if (!commit(expenses.filter((record) => record.id !== expense.id))) return;
        if (editingId === expense.id) resetForm();
        render();
        $("status").textContent = "Трата удалена.";
      });
      actions.append(edit, remove);
      item.append(actions);
      list.append(item);
    });
    $("empty-state").hidden = visible.length > 0;
    $("empty-state").querySelector("h3").textContent = expenses.length ? "За этот период расходов нет" : "Начнём с первой траты";
    $("empty-state").querySelector("p").textContent = expenses.length ? "Выберите другой период или добавьте трату." : "Добавьте расход — он появится здесь.";
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    showMessage("form-error", "");
    $("status").textContent = "";
    form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
    const cents = parseMoney(amount.value);
    const errorField = cents === null ? amount : !validDate(date.value) ? date : !CATEGORIES.includes(category.value) ? category : null;
    if (errorField) {
      showMessage("form-error", errorField === amount ? "Введите сумму больше нуля, не более двух знаков после запятой." : errorField === date ? "Выберите корректную дату." : "Выберите категорию из списка.");
      errorField.setAttribute("aria-invalid", "true");
      errorField.focus();
      return;
    }
    const wasEditing = editingId !== null;
    const record = { id: editingId || (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`), cents, category: category.value, date: date.value, comment: comment.value.trim() };
    const next = wasEditing ? expenses.map((expense) => expense.id === editingId ? record : expense) : [...expenses, record];
    if (!commit(next)) return;
    resetForm();
    render();
    $("status").textContent = wasEditing ? "Изменения сохранены." : "Трата добавлена.";
    amount.focus();
  });

  $("cancel-edit").addEventListener("click", () => { resetForm(); amount.focus(); });
  document.querySelectorAll("[data-period]").forEach((button) => button.addEventListener("click", () => applyPeriod(button.dataset.period)));
  [from, to].forEach((input) => input.addEventListener("change", () => { activePeriod = "custom"; render(); }));
  function refreshDay() {
    if (displayedDay === localDate()) return;
    if (!editingId) date.value = localDate();
    if (["day", "week", "month"].includes(activePeriod)) applyPeriod(activePeriod);
    else render();
  }
  window.setInterval(refreshDay, 1000);
  window.addEventListener("focus", refreshDay);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDay(); });
  load();
  loadBudgets();
  resetForm();
  render();
})();
