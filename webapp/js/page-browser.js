import { h } from "./render.js";
import { pageRange } from "./pipeline/pdf.js";

export function pageSelectionText(selected, count) {
  const pages = [...new Set(selected)].sort((a, b) => a - b);
  if (pages.length === count) return "all";
  const ranges = [];
  for (let i = 0; i < pages.length; i++) {
    const start = pages[i];
    while (pages[i + 1] === pages[i] + 1) i++;
    ranges.push(start === pages[i] ? String(start) : `${start}-${pages[i]}`);
  }
  return ranges.join(", ");
}

// Thumbnails are rendered only near the visible part of the contact sheet.
// Full-size previews and model input share the caller's PDF render queue.
export function pageBrowser({ pages, render }) {
  let pdf = null, observer = null, revision = 0, previewRevision = 0, previewPage = 1, previewUrl = null;
  const urls = [], cards = new Map();
  const selection = () => pages.value.trim() ? pageRange(pages.value, pdf.doc.numPages) : [];
  const count = h("p", { class: "meta", role: "status" });
  const grid = h("div", { class: "pdf-contact-sheet", "aria-label": "PDF page thumbnails" });
  const title = h("summary", {}, "Browse all PDF pages");
  const onlySelected = h("input", { type: "checkbox" });
  const jump = h("input", { type: "number", min: 1, value: 1, "aria-label": "Jump to PDF page" });
  const previewTitle = h("h3");
  const previewStatus = h("p", { class: "meta", role: "status" });
  const image = h("img", { class: "pdf-page-preview", alt: "" });
  const include = h("input", { type: "checkbox" });
  const setSelected = (page, checked) => {
    try {
      const selected = new Set(selection());
      if (checked) selected.add(page);
      else selected.delete(page);
      pages.value = pageSelectionText([...selected], pdf.doc.numPages);
      pages.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (error) { count.textContent = error.message; }
  };
  const previous = h("button", { onclick: () => showPage(previewPage - 1) }, "← Previous page");
  const next = h("button", { onclick: () => showPage(previewPage + 1) }, "Next page →");
  const dialog = h("dialog", { class: "pdf-preview-dialog", "aria-label": "PDF page preview" },
    h("div", { class: "actions" }, previous, next, h("button", { onclick: () => dialog.close() }, "Close preview")),
    previewTitle, h("label", {}, include, " Include in sample pages"), previewStatus, image);
  const clearPreview = () => {
    previewRevision++;
    image.removeAttribute("src");
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  };
  dialog.addEventListener("close", clearPreview);
  include.addEventListener("change", () => setSelected(previewPage, include.checked));
  const showPage = async page => {
    if (!pdf || page < 1 || page > pdf.doc.numPages) return;
    clearPreview();
    const current = previewRevision, source = pdf;
    previewPage = page;
    previewTitle.textContent = `PDF page ${page} of ${pdf.doc.numPages}`;
    image.alt = `Full PDF page ${page}`;
    previous.disabled = page === 1;
    next.disabled = page === pdf.doc.numPages;
    include.checked = cards.get(page).checkbox.checked;
    previewStatus.textContent = "Preparing page preview…";
    if (!dialog.open) dialog.showModal();
    try {
      const rendered = await render(source.doc, page, 150);
      if (pdf !== source || current !== previewRevision) return;
      previewUrl = URL.createObjectURL(rendered.blob);
      image.src = previewUrl;
      previewStatus.textContent = "";
    } catch (error) { if (current === previewRevision) previewStatus.textContent = error.message; }
  };
  const refreshSelection = () => {
    if (!pdf) return;
    try {
      const selected = new Set(selection());
      for (const [page, card] of cards) {
        card.checkbox.checked = selected.has(page);
        card.element.hidden = onlySelected.checked && !selected.has(page);
      }
      include.checked = selected.has(previewPage);
      count.textContent = `${selected.size} of ${pdf.doc.numPages} PDF pages selected for the proposal.`;
    } catch (error) {
      count.textContent = error.message;
      for (const card of cards.values()) card.element.hidden = false;
    }
  };
  pages.addEventListener("input", refreshSelection);
  onlySelected.addEventListener("change", refreshSelection);
  const element = h("div", {}, h("details", { class: "pdf-page-browser" }, title,
    h("p", { class: "hint" }, "Look through the PDF before choosing samples. Open a thumbnail for a larger view, and check pages to include them."),
    h("div", { class: "actions" }, h("label", {}, onlySelected, " Show selected pages only"),
      h("label", {}, " PDF page ", jump), h("button", { onclick: () => {
        const page = Number(jump.value);
        if (!jump.reportValidity()) return;
        onlySelected.checked = false;
        refreshSelection();
        cards.get(page)?.element.scrollIntoView({ block: "nearest" });
      } }, "Go to page")), grid), count, dialog);
  return {
    element,
    refreshSelection,
    showSelection() {
      onlySelected.checked = true;
      element.querySelector("details").open = true;
      refreshSelection();
      grid.scrollTop = 0;
      element.scrollIntoView({ block: "start" });
    },
    usePdf(value) {
      revision++;
      observer?.disconnect();
      dialog.close();
      clearPreview();
      for (const url of urls) URL.revokeObjectURL(url);
      urls.length = 0;
      cards.clear();
      grid.replaceChildren();
      pdf = value;
      element.hidden = !pdf;
      onlySelected.checked = false;
      if (!pdf) return;
      const current = revision, source = pdf;
      title.textContent = `Browse all ${pdf.doc.numPages} PDF pages`;
      jump.max = pdf.doc.numPages;
      jump.value = 1;
      observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const page = Number(entry.target.dataset.page), card = cards.get(page);
          (async () => {
            try {
              const rendered = await render(source.doc, page, 36);
              if (current !== revision) return;
              const url = URL.createObjectURL(rendered.blob);
              urls.push(url);
              card.image.src = url;
              card.button.title = `Open PDF page ${page}`;
            } catch (error) { if (current === revision) card.button.title = `Preview unavailable. ${error.message}`; }
          })();
        }
      }, { root: grid, rootMargin: "160px" });
      for (let page = 1; page <= pdf.doc.numPages; page++) {
        const thumbnail = h("img", { alt: `PDF page ${page}`, width: 108, height: 148 });
        const button = h("button", { class: "pdf-thumbnail", "aria-label": `Open PDF page ${page}`,
          onclick: () => showPage(page) }, thumbnail);
        const checkbox = h("input", { type: "checkbox", "aria-label": `Include PDF page ${page} in samples`,
          onchange: () => setSelected(page, checkbox.checked) });
        const card = h("div", { class: "pdf-page-card", dataset: { page } }, button, h("label", {}, checkbox, ` Page ${page}`));
        cards.set(page, { element: card, button, checkbox, image: thumbnail });
        grid.append(card);
        observer.observe(card);
      }
      refreshSelection();
    },
  };
}
