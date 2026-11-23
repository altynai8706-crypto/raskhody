"use strict";

(() => {
  const STORAGE_KEY = "family-expenses-v1";
  const CATEGORIES = ["Еда", "Транспорт", "Дом", "Личные расходы", "Другое"];
  const $ = (id) => document.getElementById(id);
  const form = $("expense-form");
  const amount = $("amount");
  const category = $("category");
  const date = $("date");
  const comment = $("comment");
  const from = $("filter-from");
  const to = $("filter-to");
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

  function parseMoney(value) {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, fraction = ""] = normalized.split(".");
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  }

  function money(cents) {
    const whole = Math.floor(cents / 100).toLocaleString("ru-RU");
    return `${whole}${cents % 100 ? "," + String(cents % 100).padStart(2, "0") : ""} ₸`;
  }

  function showMessage(id, message) {
    $(id).textContent = message;
    $(id).hidden = !message;
  }

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
  resetForm();
  render();
})();
