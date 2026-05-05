/**
 * changelog-feedback.js
 *
 * Handles the customer feedback column for each changelog entry.
 * All data is persisted via the Flask API → PostgreSQL database.
 *
 * API surface used:
 *   GET    /api/changelog-feedback/:version          → load items
 *   POST   /api/changelog-feedback/:version          → add item(s)
 *   POST   /api/changelog-feedback/item/:id/check    → toggle checked
 *   DELETE /api/changelog-feedback/item/:id          → remove item
 *
 * Requires: mammoth.browser.min.js loaded before this script
 */

(function () {
  "use strict";

  // ── Utilities ──────────────────────────────────────────────────

  function formatDate(isoString) {
    if (!isoString) return "";
    const d = new Date(isoString);
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return months[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear();
  }

  let toastTimer = null;
  function showToast(msg, isError) {
    let toast = document.querySelector(".cl-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "cl-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? "#b42318" : "#1a1a1a";
    toast.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  function setLoading(panel, loading) {
    const btn = panel.querySelector(".cl-add-btn");
    if (btn) btn.disabled = loading;
  }

  // ── API calls ──────────────────────────────────────────────────

  async function apiGet(version) {
    const res = await fetch(
      "/api/changelog-feedback/" + encodeURIComponent(version),
    );
    if (!res.ok) throw new Error("Failed to load feedback items.");
    return res.json();
  }

  async function apiAdd(version, texts) {
    const res = await fetch(
      "/api/changelog-feedback/" + encodeURIComponent(version),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts }),
      },
    );
    if (!res.ok) throw new Error("Failed to save item.");
    return res.json();
  }

  async function apiCheck(itemId, checked) {
    const res = await fetch(
      "/api/changelog-feedback/item/" + itemId + "/check",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checked }),
      },
    );
    if (!res.ok) throw new Error("Failed to update item.");
    return res.json();
  }

  async function apiDelete(itemId) {
    const res = await fetch("/api/changelog-feedback/item/" + itemId, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error("Failed to delete item.");
    return res.json();
  }

  // ── Render ─────────────────────────────────────────────────────

  function renderChecklist(version, items) {
    const ul = document.getElementById("checklist-" + version);
    if (!ul) return;
    ul.innerHTML = "";

    if (!items || items.length === 0) return;

    items.forEach(function (item) {
      const li = document.createElement("li");
      if (item.checked) li.classList.add("is-checked");

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!item.checked;
      checkbox.setAttribute("aria-label", item.text);

      checkbox.addEventListener("change", async function () {
        checkbox.disabled = true;
        try {
          const updated = await apiCheck(item.id, checkbox.checked);
          item.checked = updated.checked;
          item.checked_at = updated.checked_at;
          li.classList.toggle("is-checked", updated.checked);

          let dateSpan = li.querySelector(".cl-check-date");
          if (updated.checked && updated.checked_at) {
            if (!dateSpan) {
              dateSpan = document.createElement("span");
              dateSpan.className = "cl-check-date";
              const removeBtn = li.querySelector(".cl-check-remove");
              li.insertBefore(dateSpan, removeBtn);
            }
            dateSpan.textContent = "Done " + formatDate(updated.checked_at);
          } else if (dateSpan) {
            dateSpan.remove();
          }
        } catch (e) {
          showToast("Could not update item.", true);
          checkbox.checked = !checkbox.checked;
        } finally {
          checkbox.disabled = false;
        }
      });

      const labelWrap = document.createElement("span");
      labelWrap.className = "cl-check-label";
      const textSpan = document.createElement("span");
      textSpan.className = "cl-check-text";
      textSpan.textContent = item.text;
      labelWrap.appendChild(textSpan);

      li.appendChild(checkbox);
      li.appendChild(labelWrap);

      if (item.checked && item.checked_at) {
        const dateSpan = document.createElement("span");
        dateSpan.className = "cl-check-date";
        dateSpan.textContent = "Done " + formatDate(item.checked_at);
        li.appendChild(dateSpan);
      }

      const removeBtn = document.createElement("button");
      removeBtn.className = "cl-check-remove";
      removeBtn.textContent = "×";
      removeBtn.title = "Remove";
      removeBtn.setAttribute("aria-label", "Remove item");
      removeBtn.addEventListener("click", async function (e) {
        e.stopPropagation();
        removeBtn.disabled = true;
        try {
          await apiDelete(item.id);
          li.remove();
        } catch (err) {
          showToast("Could not remove item.", true);
          removeBtn.disabled = false;
        }
      });

      li.appendChild(removeBtn);
      ul.appendChild(li);
    });
  }

  // ── Docx parsing via mammoth ───────────────────────────────────

  function parseDocx(file, version, panel) {
    if (typeof mammoth === "undefined") {
      showToast("mammoth.js not loaded — cannot parse .docx", true);
      return;
    }

    const reader = new FileReader();
    reader.onload = async function (e) {
      try {
        const result = await mammoth.convertToHtml({
          arrayBuffer: e.target.result,
        });
        const html = result.value;
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");

        const extracted = [];
        const listItems = doc.querySelectorAll("ol li, ul li");
        if (listItems.length > 0) {
          listItems.forEach((li) => {
            const t = li.textContent.trim();
            if (t) extracted.push(t);
          });
        } else {
          doc.querySelectorAll("p").forEach((p) => {
            const t = p.textContent.trim();
            if (t) extracted.push(t);
          });
        }

        if (extracted.length === 0) {
          showToast("No text found in the document.");
          return;
        }

        setLoading(panel, true);
        try {
          await apiAdd(version, extracted);
          const allItems = await apiGet(version);
          renderChecklist(version, allItems);
          showToast(
            extracted.length +
              " item" +
              (extracted.length > 1 ? "s" : "") +
              " imported from " +
              file.name,
          );
        } catch (err) {
          showToast("Failed to save imported items.", true);
        } finally {
          setLoading(panel, false);
        }
      } catch (err) {
        console.error("mammoth error", err);
        showToast("Could not read the .docx file.", true);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // ── Wire up each feedback panel ────────────────────────────────

  async function initPanel(panel) {
    const version = panel.dataset.version;
    if (!version) return;

    // Load items from server on page load
    try {
      const items = await apiGet(version);
      renderChecklist(version, items);
    } catch (e) {
      // Silently skip if not admin (403) or network issue
      console.warn("cl-feedback: could not load items for", version, e.message);
    }

    // Add button + Enter key
    const addBtn = panel.querySelector(
      '.cl-add-btn[data-version="' + version + '"]',
    );
    const addInput = panel.querySelector(
      '.cl-add-input[data-version="' + version + '"]',
    );

    if (addBtn && addInput) {
      async function handleAdd() {
        const text = addInput.value.trim();
        if (!text) return;
        addBtn.disabled = true;
        try {
          await apiAdd(version, [text]);
          addInput.value = "";
          const items = await apiGet(version);
          renderChecklist(version, items);
        } catch (err) {
          showToast("Could not save item.", true);
        } finally {
          addBtn.disabled = false;
          addInput.focus();
        }
      }

      addBtn.addEventListener("click", handleAdd);
      addInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") handleAdd();
      });
    }

    // Drop zone
    const dropzone = panel.querySelector(
      '.cl-dropzone[data-version="' + version + '"]',
    );
    const fileInput = panel.querySelector(
      '.cl-file-input[data-version="' + version + '"]',
    );

    if (dropzone && fileInput) {
      dropzone.addEventListener("click", function (e) {
        if (e.target !== fileInput) fileInput.click();
      });
      dropzone.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          fileInput.click();
        }
      });
      fileInput.addEventListener("change", function () {
        const file = fileInput.files[0];
        if (file) parseDocx(file, version, panel);
        fileInput.value = "";
      });
      dropzone.addEventListener("dragover", function (e) {
        e.preventDefault();
        dropzone.classList.add("is-over");
      });
      dropzone.addEventListener("dragleave", function () {
        dropzone.classList.remove("is-over");
      });
      dropzone.addEventListener("drop", function (e) {
        e.preventDefault();
        dropzone.classList.remove("is-over");
        const file = e.dataTransfer.files[0];
        if (!file) return;
        if (!file.name.endsWith(".docx")) {
          showToast("Please drop a .docx file.");
          return;
        }
        parseDocx(file, version, panel);
      });
    }
  }

  // ── Init ───────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function () {
    document
      .querySelectorAll(".cl-col--feedback[data-version]")
      .forEach(initPanel);
  });
})();
