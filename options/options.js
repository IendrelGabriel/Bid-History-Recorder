const phrasesEl = document.getElementById("phrases");
const msgEl = document.getElementById("msg");
const saveBtn = document.getElementById("save");
const sqliteEnabledEl = document.getElementById("sqliteEnabled");

function setMsg(text, isErr) {
  msgEl.textContent = text || "";
  msgEl.classList.toggle("err", !!isErr);
}

chrome.storage.sync.get({ extraApplyPhrases: "", sqliteEnabled: true }, (r) => {
  phrasesEl.value = r.extraApplyPhrases || "";
  sqliteEnabledEl.checked = !!r.sqliteEnabled;
});

saveBtn.addEventListener("click", () => {
  const extraApplyPhrases = phrasesEl.value;
  const sqliteEnabled = !!sqliteEnabledEl.checked;
  chrome.storage.sync.set({ extraApplyPhrases, sqliteEnabled }, () => {
    if (chrome.runtime.lastError) {
      setMsg(chrome.runtime.lastError.message, true);
      return;
    }
    setMsg("Saved.", false);
  });
});
