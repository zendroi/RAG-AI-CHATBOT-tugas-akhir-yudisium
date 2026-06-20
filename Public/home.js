document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const messages = document.getElementById("chatMessages");
  const emptyState = document.getElementById("emptyState");
  const logoutBtn = document.getElementById("logoutBtn");

  // Auto-resize textarea
  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
  });

  // Enter to send, Shift+Enter for new line
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  function addMessage(text, sender) {
    if (emptyState) emptyState.remove();

    const msg = document.createElement("div");
    msg.className = "msg " + sender;
    msg.textContent = text;
    messages.appendChild(msg);
    messages.scrollTop = messages.scrollHeight;
    return msg;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const question = input.value.trim();
    if (!question) return;

    addMessage(question, "user");
    input.value = "";
    input.style.height = "auto";

    const loadingMsg = addMessage("Mengetik...", "bot");
    loadingMsg.classList.add("loading");

    sendBtn.disabled = true;

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ question }),
      });

      const data = await response.json();

      loadingMsg.classList.remove("loading");

      if (!response.ok) {
        loadingMsg.textContent =
          data.message || "Maaf, terjadi kesalahan saat memproses pertanyaan.";
        return;
      }

      loadingMsg.textContent =
        data.answer || data.message || "Maaf, tidak ada jawaban yang ditemukan.";
    } catch (error) {
      console.error(error);
      loadingMsg.classList.remove("loading");
      loadingMsg.textContent = "Tidak dapat terhubung ke server.";
    } finally {
      sendBtn.disabled = false;
      messages.scrollTop = messages.scrollHeight;
    }
  });

  // Logout
  logoutBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error(err);
    } finally {
      window.location.href = "/";
    }
  });
});